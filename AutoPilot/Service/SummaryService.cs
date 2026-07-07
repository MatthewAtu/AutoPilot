using AutoPilot.DTOs;
using AutoPilot.interfaces;
using Microsoft.Identity.Client;
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
        private readonly HttpClient _groqClient;
        private readonly string _provider;
        private readonly string _groqApiKey;

        public SummaryService(IHttpClientFactory factory, IConfiguration config)
        {
            _graphClient = factory.CreateClient("graph");
            _ollamaClient = factory.CreateClient("ollama");
            _groqClient = factory.CreateClient("groq");

            var token = config["Graph:AccessToken"];
            _graphClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            _provider = config["AI:Provider"]?.ToLower() ?? "ollama";
            _groqApiKey = config["Groq:ApiKey"] ?? "";
        }

        public async Task<string> GetRecentEmailsAsync()
        {
            var messages = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=subject,from,body,receivedDateTime,isRead&$top=10"
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
                "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=subject,from,body,receivedDateTime,isRead,webLink&$top=10"
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

        private string? _cachedEmailContext;
        private DateTime _emailCacheExpiry = DateTime.MinValue;

        private async Task<string> GetEmailContextAsync()
        {
            if (_cachedEmailContext != null && DateTime.UtcNow < _emailCacheExpiry)
                return _cachedEmailContext;

            var raw = await GetRecentEmailsAsync();
            _cachedEmailContext = CapString(raw, 800);
            _emailCacheExpiry = DateTime.UtcNow.AddMinutes(5);
            return _cachedEmailContext;
        }

        private async Task<string> CallLLMAsync(string? systemPrompt, string userMessage)
        {
            if (_provider == "groq")
            {
                var messages = new List<object>();
                if (systemPrompt != null)
                    messages.Add(new { role = "system", content = systemPrompt });
                messages.Add(new { role = "user", content = userMessage });

                var requestBody = new { model = "llama-3.1-8b-instant", messages, max_tokens = 800 };
                var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions")
                {
                    Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
                };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _groqApiKey);

                var response = await _groqClient.SendAsync(request);
                var responseText = await response.Content.ReadAsStringAsync();

                using var doc = JsonDocument.Parse(responseText);
                return doc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString() ?? "No response";
            }

            // Ollama path
            var ollamaMsgs = new List<object>();
            if (systemPrompt != null)
                ollamaMsgs.Add(new { role = "system", content = systemPrompt });
            ollamaMsgs.Add(new { role = "user", content = userMessage });

            var ollamaBody = new { model = "llama3", messages = ollamaMsgs, stream = false };
            var content = new StringContent(JsonSerializer.Serialize(ollamaBody), Encoding.UTF8, "application/json");

            var ollamaResponse = await _ollamaClient.PostAsync("http://localhost:11434/api/chat", content);
            var ollamaText = await ollamaResponse.Content.ReadAsStringAsync();

            var parsed = JsonSerializer.Deserialize<BotEmailRes>(ollamaText,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return parsed?.Message?.Content ?? "No response";
        }

        public async Task<string> ChatAsync(string message)
        {
            var emailContext = await GetEmailContextAsync();

            var systemPrompt =
                "You are AutoPilot, a concise AI assistant. " +
                "Answer using the email context below. Keep replies short and actionable.\n\n" +
                $"EMAILS:\n{emailContext}";

            return await CallLLMAsync(systemPrompt, message);
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
            var systemPrompt =
                "You are an AI productivity assistant. Analyze emails and extract useful information.\n" +
                "Do NOT reply to the emails. ONLY extract insights.\n" +
                "Ignore duplicates. Identify actionable tasks and assign priority.\n\n" +
                "Output format (STRICT):\n" +
                "Summary:\n- <brief summary>\n\n" +
                "Tasks:\n1. <task 1>\n2. <task 2>\n3. <task 3>";

            var userMessage = $"--- EMAILS TO SUMMARIZE ---\n{prompt}\n--- END OF EMAILS ---";

            var cleanedResponse = await CallLLMAsync(systemPrompt, userMessage);

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

        public async Task<List<TaskItemDTO>> ExtractTasksFromTranscriptAsync(string transcript)
        {
            var systemPrompt =
                "Extract clear, actionable tasks from the transcript.\n" +
                "Output ONLY a numbered list. No preamble, no explanation.\n" +
                "Each task is a single concise sentence starting with an action verb. Maximum 10 tasks.\n\n" +
                "Output format (STRICT):\nTasks:\n1. <task 1>\n2. <task 2>...";

            var text = await CallLLMAsync(systemPrompt, transcript);
            var taskMatches = Regex.Matches(text, @"\d+\.\s+(.+)");

            return taskMatches
                .Select(m => new TaskItemDTO
                {
                    Text = m.Groups[1].Value.Trim(),
                    Priority = DetectPriority(m.Groups[1].Value)
                })
                .ToList();
        }

        public async Task<string> TranscribeAudioAsync(IFormFile file)
        {
            if (_provider != "groq")
                throw new InvalidOperationException("Audio transcription requires Groq provider (AI:Provider=groq).");

            using var form = new MultipartFormDataContent();
            using var stream = file.OpenReadStream();
            var fileContent = new StreamContent(stream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType ?? "audio/mpeg");
            form.Add(fileContent, "file", file.FileName);
            form.Add(new StringContent("whisper-large-v3"), "model");

            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/audio/transcriptions")
            {
                Content = form
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _groqApiKey);

            var response = await _groqClient.SendAsync(request);
            var responseText = await response.Content.ReadAsStringAsync();

            using var doc = JsonDocument.Parse(responseText);
            return doc.RootElement.GetProperty("text").GetString() ?? "";
        }

        public async Task WarmUpModelAsync()
        {
            if (_provider != "ollama") return;

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

        public async Task<string> GetFolderId(string DisplayName)
        {
            var mailFolders = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders"
            );

            var returnedFolders = await mailFolders.Content.ReadAsStringAsync();

            var parsedReturn = JsonSerializer.Deserialize<RecieveEmailDTO>(returnedFolders,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var cleanedFolders = parsedReturn?.Value?
                .Select(e => new
                {
                    e.Id,
                    e.DisplayName
                })
                .ToList();

            string FolderId = "";

            if (cleanedFolders != null)
            {
                foreach (var folder in cleanedFolders)
                {
                    if (folder.DisplayName == DisplayName)
                    {
                        if (folder.Id != null)
                        {
                            FolderId = folder.Id;
                            return FolderId;
                        }
                    }
                }
            }
            return FolderId;
        }

        public async Task<string> GetCompletedEmails()
        {   
            var completedFolderId = await GetFolderId("Completed");

            var completeMessages = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/mailFolders/{completedFolderId}/messages"
            );

            var completeEmails = await completeMessages.Content.ReadAsStringAsync();

            var parsedCompleteEmail = JsonSerializer.Deserialize<RecieveEmailDTO>(completeEmails,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var cleanedEmails = parsedCompleteEmail?.Value?
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

        public async Task CategorizeCompletedEmails()
        {
            // get the emails that are in the completed
            var emails = await GetCompletedEmails();

            var prompt = """
            You are an email classification engine.

            Your job is to classify a completed email into exactly one of the following categories:

            - Finance
            - HR
            - IT Support
            - Procurement
            - Approvals
            - Vendor Management
            - General Inquiry

            Rules:
            1. Return only the category name.
            2. Do not explain your reasoning.
            3. Do not return multiple categories.
            4. If the email does not clearly fit a category, return "General Inquiry".
            5. Consider both the subject and body when classifying.

            Email Subject:
            {subject}

            Email Body:
            {body}

            Category:
            """;
            
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var now = DateTime.Now;
                var nextRun = new DateTime(now.Year, now.Month, now.Day, 9, 0, 0);

                if (now > nextRun)
                    nextRun = nextRun.AddDays(1);

                var delay = nextRun - now;
                if (delay < TimeSpan.Zero)
                    delay = TimeSpan.Zero;

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
