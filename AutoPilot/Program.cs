using AutoPilot.Service;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddControllers();
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = 500_000_000; // 500 MB for video uploads
});
builder.Services.AddHttpClient("graph", client =>
{
    client.BaseAddress = new Uri("https://graph.microsoft.com/v1.0/");
    client.Timeout = TimeSpan.FromMinutes(2);
});

builder.Services.AddHttpClient("ollama", client =>
{
    client.BaseAddress = new Uri("http://localhost:11434/");
    client.Timeout = TimeSpan.FromMinutes(10);
});

builder.Services.AddHttpClient("groq", client =>
{
    client.BaseAddress = new Uri("https://api.groq.com/");
    client.Timeout = TimeSpan.FromMinutes(2);
});
// builder.Services.AddScoped<GraphAuthService>();
builder.Services.AddSingleton<HealthMonitorStore>();
builder.Services.AddSingleton<DailyTaskListStore>();
builder.Services.AddSingleton<TriageDraftStore>();
builder.Services.AddScoped<SummaryService>();
builder.Services.AddHostedService<SummaryService>();

builder.Services.AddHttpClient();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyMethod()
              .AllowAnyHeader()));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

try
{
    using var scope = app.Services.CreateScope();
    var AiWarmer = scope.ServiceProvider.GetRequiredService<SummaryService>();
    await AiWarmer.WarmUpModelAsync();
    // daily summary goes here
}
catch (Exception ex)
{
    Console.WriteLine($"Warmup failed: {ex.Message}");
}

app.UseHttpsRedirection();

app.UseCors();

app.UseRouting();

app.MapControllers();

app.Run();
