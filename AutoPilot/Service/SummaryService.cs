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
        private readonly HealthMonitorStore _healthStore;

        private static readonly string[] Categories =
        [
            "Finance",
            "Requests",
            "IT Support",
            "Approvals",
            "General Inquiry"
        ];

        public SummaryService(IHttpClientFactory factory, IConfiguration config, HealthMonitorStore healthStore)
        {
            _graphClient = factory.CreateClient("graph");
            _ollamaClient = factory.CreateClient("ollama");
            _groqClient = factory.CreateClient("groq");
            _healthStore = healthStore;

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
                                // Name = "Atu, Matthew",
                                // Address = "matthew.atu@ontario.ca"
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

        public async Task<List<MailFolderDTO>> GetMailFoldersAsync()
        {
            var folders = new List<MailFolderDTO>();
            var url = "https://graph.microsoft.com/v1.0/me/mailFolders?$select=id,displayName,unreadItemCount&$top=100";

            while (!string.IsNullOrEmpty(url))
            {
                var response = await _graphClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) break;

                var raw = await response.Content.ReadAsStringAsync();
                var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (parsed?.Value != null)
                    folders.AddRange(parsed.Value
                        .Where(f => !string.IsNullOrEmpty(f.DisplayName))
                        .Select(f => new MailFolderDTO
                        {
                            Id = f.Id,
                            Name = f.DisplayName,
                        }));

                url = parsed?.NextLink ?? "";
            }

            return folders.OrderBy(f => f.Name).ToList();
        }

        public async Task<bool> MoveEmailToFolderAsync(string emailId, string folderName)
        {
            var folderId = await GetOrCreateFolderId(folderName);
            if (string.IsNullOrEmpty(folderId)) return false;
            return await MoveMessageAsync(emailId, folderId);
        }

        public async Task<string> GetFolderId(string DisplayName)
        {
            var url = "https://graph.microsoft.com/v1.0/me/mailFolders?$top=100";

            while (!string.IsNullOrEmpty(url))
            {
                var mailFolders = await _graphClient.GetAsync(url);
                var returnedFolders = await mailFolders.Content.ReadAsStringAsync();

                var parsedReturn = JsonSerializer.Deserialize<RecieveEmailDTO>(returnedFolders,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                var match = parsedReturn?.Value?.FirstOrDefault(f => f.DisplayName == DisplayName);
                if (match?.Id != null)
                {
                    Console.WriteLine("Id: " + match.Id + " Name: " + DisplayName);
                    return match.Id;
                }

                url = parsedReturn?.NextLink ?? "";
            }

            return "";
        }

        public async Task<string> CreateFolder(string displayName)
        {
            var requestBody = new { displayName };
            var content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json");

            var response = await _graphClient.PostAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders",
                content);

            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Failed to create folder '{displayName}'. Status: {response.StatusCode}");
                return "";
            }

            var parsed = JsonSerializer.Deserialize<ValueDTO>(responseText,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            Console.WriteLine($"Created folder '{displayName}' with Id: {parsed?.Id}");
            return parsed?.Id ?? "";
        }

        public async Task<string> GetOrCreateFolderId(string displayName)
        {
            var folderId = await GetFolderId(displayName);
            if (!string.IsNullOrEmpty(folderId))
                return folderId;

            return await CreateFolder(displayName);
        }

        public async Task<string> GetCompletedEmails()
        {
            var folderId = await GetFolderId("To Categorize");
            if (string.IsNullOrEmpty(folderId)) return "No emails found.";

            var response = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/mailFolders/{folderId}/messages?$select=id,subject,from,body,receivedDateTime&$top=50"
            );

            var raw = await response.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var emailText = parsed?.Value?.Any() == true
                ? string.Join("\n\n", parsed.Value.Select(e =>
                    $"Id: {e.Id ?? "Unknown"}\n" +
                    $"Subject: {e.Subject ?? "No Subject"}\n" +
                    $"Body: {e.Body?.Content ?? "No Content"}"))
                : "No emails found.";

            return StripHtml(emailText);
        }

        public async Task<List<PendingEmailDTO>> GetPendingCategorizeEmailsAsync()
        {
            var folderId = await GetFolderId("To Categorize");
            if (string.IsNullOrEmpty(folderId)) return [];

            var response = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/mailFolders/{folderId}/messages?$select=id,subject,from,body,receivedDateTime&$top=50&$orderby=receivedDateTime+desc"
            );

            if (!response.IsSuccessStatusCode) return [];

            var raw = await response.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return parsed?.Value?
                .Select(e => new PendingEmailDTO
                {
                    Id = e.Id,
                    Subject = e.Subject ?? "No Subject",
                    From = e.From?.EmailAddress?.Name ?? "Unknown",
                    Preview = CapString(StripHtml(e.Body?.Content ?? ""), 120),
                    ReceivedTime = FormatReceivedTime(e.ReceivedDateTime)
                })
                .ToList() ?? [];
        }

        public async Task<CategorizeResultDTO> CategorizeCompletedEmails()
        {
            var result = new CategorizeResultDTO();

            var folderId = await GetFolderId("To Categorize");
            if (string.IsNullOrEmpty(folderId)) return result;

            var messages = await GetFolderMessagesStructured(folderId);
            if (messages == null || messages.Count == 0) return result;

            var emailText = string.Join("\n\n", messages.Select(e =>
                $"Id: {e.Id}\n" +
                $"Subject: {e.Subject ?? "No Subject"}\n" +
                $"Body: {CapString(StripHtml(e.Body?.Content ?? ""), 300)}"));

            var systemPrompt = $"""
            You are an email classification engine.

            Your job is to classify each email into exactly one of the following categories:

            {string.Join("\n", Categories.Select(c => $"- {c}"))}

            Rules:
            1. Return only the category name per email.
            2. Do not explain your reasoning.
            3. If the email does not clearly fit a category, return "General Inquiry".
            4. Each email starts with "Id:". Classify each one.
            5. Separate every category by a comma, one per email, in the same order.
            6. Do not include any punctuation at the end.
            """;

            var getCategories = await CallLLMAsync(systemPrompt,
                $"Classify these emails:\n\n{emailText}");

            var assignedCategories = getCategories
                .Split(',')
                .Select(x => x.Trim())
                .ToArray();

            for (var i = 0; i < Math.Min(assignedCategories.Length, messages.Count); i++)
            {
                var category = assignedCategories[i];
                var msg = messages[i];
                if (string.IsNullOrEmpty(msg.Id)) continue;

                var validCategory = Categories.Contains(category) ? category : "General Inquiry";
                var destinationFolderId = await GetOrCreateFolderId(validCategory);

                var moved = !string.IsNullOrEmpty(destinationFolderId) &&
                            await MoveMessageAsync(msg.Id, destinationFolderId);

                if (moved)
                {
                    result.Processed++;
                    result.Results.Add(new CategorizedEmailDTO
                    {
                        Subject = msg.Subject ?? "No Subject",
                        From = msg.From?.EmailAddress?.Name ?? "Unknown",
                        AssignedCategory = validCategory
                    });
                }
                else
                {
                    result.Errors.Add($"Could not move '{msg.Subject}' to '{validCategory}'");
                }
            }

            return result;
        }

        // Returns null on a failed fetch so callers can distinguish "folder is empty" from
        // "couldn't reach Graph this pass" — the latter must never be treated as emails vanishing.
        private async Task<List<ValueDTO>?> GetFolderMessagesStructured(string folderId)
        {
            var messages = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/mailFolders/{folderId}/messages?$select=id,subject,from,body,receivedDateTime&$top=100"
            );

            if (!messages.IsSuccessStatusCode) return null;

            var raw = await messages.Content.ReadAsStringAsync();

            var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return parsed?.Value ?? [];
        }

        private static string StripQuotedHeaders(string body)
        {
            // Remove quoted reply/forward header lines (From:, Sent:, To:, Cc:, Subject:, Received:)
            // so the LLM never sees them as candidate deadline dates.
            return Regex.Replace(body, @"^\s*(From|Sent|To|Cc|Subject|Received):.*$", "",
                RegexOptions.Multiline | RegexOptions.IgnoreCase);
        }

        private async Task<DateTime?> ExtractDeadlineAsync(string subject, string body)
        {
            var today = DateTime.Now.ToString("yyyy-MM-dd");
            var cleanedBody = StripQuotedHeaders(body);

            var systemPrompt = $"""
            You are a deadline extraction engine. Today's date is {today}.

            Read the email below and determine if the SENDER is asking for something to be done
            by a specific date (e.g. "by Friday", "due June 5th", "EOD tomorrow", "respond within 2 days").

            Rules:
            1. Only count a date as a deadline if the email is asking the recipient to complete, respond,
               or deliver something by that date.
            2. If a deadline is mentioned, resolve it to an absolute date using today's date as the reference
               and respond with ONLY that date in the format YYYY-MM-DD.
            3. If no deadline is mentioned, respond with exactly: none
            4. Do not explain your reasoning. Do not include any other text.
            """;

            var userPrompt = $"Subject: {subject}\nBody: {CapString(cleanedBody, 1500)}";

            var response = await CallLLMAsync(systemPrompt, userPrompt);
            var cleaned = response.Trim().Trim('"');

            if (cleaned.Equals("none", StringComparison.OrdinalIgnoreCase)) return null;

            return DateTime.TryParse(cleaned, out var deadline) ? deadline.Date : null;
        }

        // User-initiated: called when someone clicks "Mark Complete" in the UI for an email
        // still sitting in a category folder. Moves it to "Resolved" and updates the tracked record.
        public async Task<bool> MarkEmailCompleteAsync(string emailId)
        {
            var resolvedFolderId = await GetOrCreateFolderId("Resolved");
            if (string.IsNullOrEmpty(resolvedFolderId)) return false;

            if (!await MoveMessageAsync(emailId, resolvedFolderId)) return false;

            var store = await _healthStore.LoadAsync();
            if (store.Emails.TryGetValue(emailId, out var record))
            {
                record.ResolvedAt = DateTime.UtcNow;
                record.ResolutionReason = "ManualComplete";
                await _healthStore.SaveAsync(store);
            }

            return true;
        }

        private async Task<bool> MoveMessageAsync(string messageId, string destinationFolderId)
        {
            var moveRequest = new MoveRequestDTO { DestinationId = destinationFolderId };
            var requestBody = new StringContent(
                JsonSerializer.Serialize(moveRequest),
                Encoding.UTF8,
                "application/json");

            var response = await _graphClient.PostAsync(
                $"https://graph.microsoft.com/v1.0/me/messages/{messageId}/move",
                requestBody);

            return response.IsSuccessStatusCode;
        }

        private static string DetermineStatus(TrackedEmailRecord record, DateTime now)
        {
            if (record.Deadline.HasValue)
                return now.Date > record.Deadline.Value.Date ? "Overdue" : "OnTrack";

            return (now - record.ReceivedDateTime).TotalDays > 1 ? "Warning" : "OnTrack";
        }

        public async Task RefreshHealthMonitorAsync()
        {
            var store = await _healthStore.LoadAsync();
            var now = DateTime.UtcNow;
            var seenIds = new HashSet<string>();
            var scannedCategories = new HashSet<string>();

            foreach (var category in Categories)
            {
                var folderId = await GetOrCreateFolderId(category);
                if (string.IsNullOrEmpty(folderId)) continue;

                var messages = await GetFolderMessagesStructured(folderId);
                if (messages == null) continue; // fetch failed this pass — don't treat as "folder emptied"

                scannedCategories.Add(category);

                foreach (var msg in messages)
                {
                    if (string.IsNullOrEmpty(msg.Id)) continue;
                    seenIds.Add(msg.Id);

                    var bodyText = StripHtml(msg.Body?.Content ?? "");

                    if (store.Emails.TryGetValue(msg.Id, out var existing))
                    {
                        existing.LastCheckedAt = now;
                        existing.ResolvedAt = null;
                        existing.ResolutionReason = null;
                    }
                    else
                    {
                        var receivedAt = DateTime.TryParse(msg.ReceivedDateTime, out var rdt) ? rdt.ToUniversalTime() : now;
                        var deadline = await ExtractDeadlineAsync(msg.Subject ?? "", bodyText);

                        existing = new TrackedEmailRecord
                        {
                            Id = msg.Id,
                            Category = category,
                            Subject = msg.Subject ?? "No Subject",
                            From = msg.From?.EmailAddress?.Name ?? "Unknown",
                            ReceivedDateTime = receivedAt,
                            Deadline = deadline,
                            FirstSeenAt = now,
                            LastCheckedAt = now
                        };
                        store.Emails[msg.Id] = existing;
                    }
                }
            }

            // Mark records no longer present in their category folder as resolved (moved/deleted elsewhere).
            // Only do this for categories we actually managed to scan this pass.
            foreach (var record in store.Emails.Values)
            {
                if (scannedCategories.Contains(record.Category) && !seenIds.Contains(record.Id) && record.ResolvedAt == null)
                {
                    record.ResolvedAt = now;
                    record.ResolutionReason = "MissingFromFolder";
                }
            }

            // If the user dragged a tracked email straight into "Resolved" in Outlook (instead of
            // clicking Mark Complete), recognize that as a manual completion too.
            var resolvedFolderIdForScan = await GetOrCreateFolderId("Resolved");
            if (!string.IsNullOrEmpty(resolvedFolderIdForScan))
            {
                var resolvedMessages = await GetFolderMessagesStructured(resolvedFolderIdForScan);
                if (resolvedMessages != null)
                {
                    foreach (var msg in resolvedMessages)
                    {
                        if (string.IsNullOrEmpty(msg.Id)) continue;
                        if (store.Emails.TryGetValue(msg.Id, out var record) && record.ResolutionReason != "ManualComplete")
                        {
                            record.ResolvedAt ??= now;
                            record.ResolutionReason = "ManualComplete";
                        }
                    }
                }
            }

            var overdueByCategory = new Dictionary<string, int>();
            var warningByCategory = new Dictionary<string, int>();
            foreach (var category in Categories)
            {
                var active = store.Emails.Values.Where(e => e.Category == category && e.ResolvedAt == null).ToList();
                overdueByCategory[category] = active.Count(e => DetermineStatus(e, now) == "Overdue");
                warningByCategory[category] = active.Count(e => DetermineStatus(e, now) == "Warning");
            }

            var lastSnapshot = store.History.LastOrDefault();
            if (lastSnapshot == null || (now - lastSnapshot.Timestamp).TotalHours >= 1)
            {
                store.History.Add(new HealthHistorySnapshot
                {
                    Timestamp = now,
                    OverdueByCategory = overdueByCategory,
                    WarningByCategory = warningByCategory
                });

                if (store.History.Count > 2160) // ~90 days of hourly snapshots
                    store.History.RemoveRange(0, store.History.Count - 2160);
            }

            await _healthStore.SaveAsync(store);
        }

        public async Task<HealthMonitorResponseDTO> GetHealthMonitorSnapshot()
        {
            var store = await _healthStore.LoadAsync();
            var now = DateTime.UtcNow;

            var response = new HealthMonitorResponseDTO { GeneratedAt = now };

            foreach (var category in Categories)
            {
                var active = store.Emails.Values
                    .Where(e => e.Category == category && e.ResolvedAt == null)
                    .OrderByDescending(e => now - e.ReceivedDateTime)
                    .ToList();

                var emailDtos = active.Select(e => new EmailHealthDTO
                {
                    Id = e.Id,
                    Subject = e.Subject,
                    From = e.From,
                    Category = e.Category,
                    ReceivedDateTime = e.ReceivedDateTime,
                    Deadline = e.Deadline,
                    Status = DetermineStatus(e, now),
                    AgeHours = Math.Round((now - e.ReceivedDateTime).TotalHours, 1)
                }).ToList();

                response.Categories.Add(new CategoryHealthDTO
                {
                    Category = category,
                    Total = emailDtos.Count,
                    OnTrack = emailDtos.Count(e => e.Status == "OnTrack"),
                    Warning = emailDtos.Count(e => e.Status == "Warning"),
                    Overdue = emailDtos.Count(e => e.Status == "Overdue"),
                    AvgAgeHours = emailDtos.Count > 0 ? Math.Round(emailDtos.Average(e => e.AgeHours), 1) : 0,
                    Emails = emailDtos
                });
            }

            response.OverdueItems = response.Categories
                .SelectMany(c => c.Emails)
                .Where(e => e.Status is "Warning" or "Overdue")
                .OrderByDescending(e => e.AgeHours)
                .ToList();

            response.History = store.History.Select(h => new HistorySnapshotDTO
            {
                Timestamp = h.Timestamp,
                OverdueByCategory = h.OverdueByCategory,
                WarningByCategory = h.WarningByCategory
            }).ToList();

            response.RecentlyCompleted = store.Emails.Values
                .Where(e => e.ResolutionReason == "ManualComplete")
                .OrderByDescending(e => e.ResolvedAt)
                .Take(20)
                .Select(e => new CompletedEmailDTO
                {
                    Id = e.Id,
                    Subject = e.Subject,
                    From = e.From,
                    Category = e.Category,
                    ResolvedAt = e.ResolvedAt!.Value
                })
                .ToList();

            return response;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            DateTime lastSummaryRun = DateTime.MinValue;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Run categorization every 5 minutes
                    await CategorizeCompletedEmails();

                    // Refresh category health/overdue tracking
                    await RefreshHealthMonitorAsync();

                    // Run summary once per day at 9 AM
                    var now = DateTime.Now;

                    if (now.Hour >= 9 && lastSummaryRun.Date != now.Date)
                    {
                        Console.WriteLine("Sending Daily Summary...");

                        var recentEmails = await GetRecentEmailsAsync();
                        var getBotSummary = await GetBotEmailSummary(recentEmails);

                        await SendTasksEmailToOutLook(getBotSummary);

                        lastSummaryRun = now;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Background job failed: {ex.Message}");
                }

                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
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
