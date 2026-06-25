using AutoPilot.DTOs;
using AutoPilot.interfaces;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AutoPilot.Service
{
    public class SummaryService : BackgroundService, ISummaryService
    {
        private readonly HttpClient _graphClient;
        private readonly HttpClient _ollamaClient;

        public SummaryService(IHttpClientFactory factory, IConfiguration config)
        {
            _graphClient = factory.CreateClient("graph");
            _ollamaClient = factory.CreateClient("ollama");

            var token = config["Graph:AccessToken"];
            _graphClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);
        }

        public async Task<string> GetRecentEmailsAsync()
        {
            var messages = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/messages?$select=subject,from,body,receivedDateTime,isRead&$top=10"
            );

            var returnedEmails = await messages.Content.ReadAsStringAsync();

            var parsedReturn = JsonSerializer.Deserialize<RecieveEmailDTO>(returnedEmails,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var cleanedEmails = parsedReturn?.Value?
                .Select(e => new
                {
                    e.Id,
                    e.Subject,
                    e.Body?.Content,
                    e.From?.EmailAddress?.Name
                })
                .ToList();

            var emailText = cleanedEmails?.Any() == true
                ? string.Join("\n\n",
                    cleanedEmails.Select(e =>
                        $"From: {e?.Name ?? "Unknown"}\n" +
                        $"Subject: {e?.Subject ?? "No Subject"}\n" +
                        $"Body: {e?.Content ?? "No Content"}"
                    )
                )
                : "No emails found.";

            return CapString(StripHtml(emailText));
        }

        public async Task<List<EmailItemDTO>> GetStructuredEmailsAsync()
        {
            var messages = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/messages?$select=subject,from,body,receivedDateTime,isRead,webLink&$top=10"
            );

            var returnedEmails = await messages.Content.ReadAsStringAsync();
            var parsedReturn = JsonSerializer.Deserialize<RecieveEmailDTO>(returnedEmails,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return parsedReturn?.Value?
                .Select(e => new EmailItemDTO
                {
                    Id = e.Id,
                    Subject = e.Subject ?? "No Subject",
                    From = e.From?.EmailAddress?.Name ?? "Unknown",
                    Preview = CapString(StripHtml(e.Body?.Content ?? ""), 120),
                    ReceivedTime = FormatReceivedTime(e.ReceivedDateTime),
                    Unread = !e.IsRead,
                    WebLink = e.WebLink 
                })
                .ToList() ?? [];
        }

        public async Task<List<CalendarEventDTO>> GetCalendarEventsAsync()
        {
            var today = DateTime.UtcNow.Date;
            var start = today.ToString("yyyy-MM-ddTHH:mm:ss");
            var end = today.AddDays(1).AddSeconds(-1).ToString("yyyy-MM-ddTHH:mm:ss");

            var response = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/calendarView?startDateTime={start}&endDateTime={end}&$select=subject,start,end,attendees"
            );

            var content = await response.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<CalendarApiResponse>(content,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return parsed?.Value?
                .Select(e => new CalendarEventDTO
                {
                    Id = e.Id,
                    Title = e.Subject ?? "Untitled",
                    Start = FormatCalendarTime(e.Start?.DateTime),
                    End = FormatCalendarTime(e.End?.DateTime),
                    Attendees = e.Attendees?.Count ?? 0
                })
                .ToList() ?? [];
        }

        public async Task<string> ChatAsync(string message)
        {
            var emailContext = await GetRecentEmailsAsync();

            var systemPrompt = $@"You are AutoPilot, a concise AI productivity assistant.

                You have access to the user's recent emails below. Use them to answer questions accurately.
                When the user asks to summarize emails, list tasks, or asks anything about their inbox — use this data.
                Keep responses short and actionable.

                --- RECENT EMAILS ---
                {emailContext}
                --- END EMAILS ---";

            var requestBody = new
            {
                model = "llama3",
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = message }
                },
                stream = false
            };

            var content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json"
            );

            var response = await _ollamaClient.PostAsync("http://localhost:11434/api/chat", content);
            var responseText = await response.Content.ReadAsStringAsync();

            var parsed = JsonSerializer.Deserialize<BotEmailRes>(responseText,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return parsed?.Message?.Content ?? "No response";
        }

        public async Task<List<TaskItemDTO>> GetTasksAsync()
        {
            var emailText = await GetRecentEmailsAsync();
            var botSummary = await GetBotEmailSummary(emailText);
            var botText = botSummary.Message?.Body?.Content ?? "";

            var tasksSection = Regex.Match(botText, @"Tasks:\s*([\s\S]+?)(?:\n\n|$)");
            if (!tasksSection.Success) return [];

            var taskMatches = Regex.Matches(tasksSection.Groups[1].Value, @"\d+\.\s+(.+)");

            return taskMatches
                .Select(m => new TaskItemDTO
                {
                    Text = m.Groups[1].Value.Trim(),
                    Priority = DetectPriority(m.Groups[1].Value)
                })
                .ToList();
        }

        public async Task<bool> SendTasksEmailToOutLook(SendEmailDTO email)
        {
            var requestJson = JsonSerializer.Serialize(email);
            var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
            
            Console.WriteLine("Sending Email");

            var sendEmail = await _graphClient.PostAsync(
                "https://graph.microsoft.com/v1.0/me/sendMail",
                content
            );
                     
            return sendEmail.IsSuccessStatusCode;
        }

        public async Task<SendEmailDTO> GetBotEmailSummary(string prompt)
        {
            var llamaPrompt = $@"
                You are an AI productivity assistant.

                Your job is to analyze emails and extract useful information for the user.

                Instructions:
                - Do NOT respond as if you are part of the conversation.
                - Do NOT reply to the emails.
                - ONLY extract useful insights.
                - Ignore duplicate emails (treat them as one).
                - Identify important information and actionable tasks.
                - Assign priority to tasks based on urgency and importance.
                - Add more tasks if necessary.

                Output format (STRICT):
                Summary:
                - <brief summary of all emails>

                Tasks:
                1. <task 1>
                2. <task 2>
                3. <task 3>

                
                --- EMAILS TO SUMMARIZE ---
                {prompt}
                --- END OF EMAILS TO SUMMARIZE ---
                ";

            var requestBody = new
            {
                model = "llama3",
                messages = new[]
                {
                    new { role = "user", content = llamaPrompt }
                },
                stream = false
            };

            var content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json"
            );

            var sendToBot = await _ollamaClient.PostAsync("http://localhost:11434/api/chat", content);
            var botEmailResponse = await sendToBot.Content.ReadAsStringAsync();

            var parsedReturn = JsonSerializer.Deserialize<BotEmailRes>(botEmailResponse,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var cleanedResponse = parsedReturn?.Message?.Content;

            return new SendEmailDTO
            {
                Message = new MessageDto
                {
                    Subject = "Daily Summary",
                    Body = new BodyDto
                    {
                        ContentType = "Text",
                        Content = cleanedResponse
                    },
                    ToRecipients =
                    [
                        new RecipientDto
                        {
                            EmailAddress = new EmailAddressDto
                            {
                                Name = "Atu, Matthew",
                                Address = "matthew.atu@ontario.ca"
                            }
                        }
                    ]
                }
            };
        }

        public async Task WarmUpModelAsync()
        {
            var requestBody = new
            {
                model = "llama3",
                prompt = "Hello",
                stream = false
            };

            var content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json"
            );

            await _ollamaClient.PostAsync("http://localhost:11434/api/generate", content);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var now = DateTime.Now;
                var nextRun = new DateTime(now.Year, now.Month, now.Day, 9, 0, 0);

                if (now > nextRun)
                {
                    nextRun = nextRun.AddDays(1);
                }

                var delay = nextRun - now;

                if (delay < TimeSpan.Zero)
                {
                    delay = TimeSpan.Zero;
                }
                
                await Task.Delay(delay, stoppingToken);

                Console.WriteLine("Sending Daily Summary...");
                var recentEmails = await GetRecentEmailsAsync();
                var getBotSummary = await GetBotEmailSummary(recentEmails);
                await SendTasksEmailToOutLook(getBotSummary);
            }    
        }

        public static string CapString(string input, int maxLength = 2000)
        {
            if (string.IsNullOrEmpty(input)) return input;
            return input.Length > maxLength ? input[..maxLength] : input;
        }

        public static string StripHtml(string html)
        {
            html = Regex.Replace(html, "<!--.*?-->", string.Empty, RegexOptions.Singleline);
            html = Regex.Replace(html, "<.*?>", string.Empty);
            return WebUtility.HtmlDecode(html);
        }

        private static string FormatReceivedTime(string? raw)
        {
            if (string.IsNullOrEmpty(raw)) return "";
            if (!DateTimeOffset.TryParse(raw, out var dt)) return "";
            var local = dt.LocalDateTime;
            return local.Date == DateTime.Today ? local.ToString("h:mm tt") : local.ToString("MMM d");
        }

        private static string FormatCalendarTime(string? raw)
        {
            if (string.IsNullOrEmpty(raw)) return "";
            if (!DateTime.TryParse(raw, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt)) return "";
            return dt.ToString("h:mm tt");
        }

        private static string DetectPriority(string text)
        {
            var lower = text.ToLower();
            if (lower.Contains("urgent") || lower.Contains("asap") || lower.Contains("immediately") || lower.Contains("today") || lower.Contains("deadline"))
                return "high";
            if (lower.Contains("soon") || lower.Contains("week") || lower.Contains("friday") || lower.Contains("review") || lower.Contains("prepare"))
                return "medium";
            return "low";
        }
    }
}
