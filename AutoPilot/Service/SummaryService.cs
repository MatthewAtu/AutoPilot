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
        private readonly DailyTaskListStore _taskListStore;
        private readonly TriageDraftStore _triageDraftStore;

        private static readonly string[] DefaultCategories =
        [
            "Finance",
            "Requests",
            "IT Support",
            "Approvals",
            "General Inquiry"
        ];

        // Default categories plus any user-created folders, deduped so a custom folder
        // that happens to match a default name (any case) doesn't show up twice.
        private static List<string> ResolveCategories(HealthMonitorStoreData store) =>
            DefaultCategories
                .Concat(store.CustomCategories ?? [])
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

        public SummaryService(IHttpClientFactory factory, IConfiguration config, HealthMonitorStore healthStore, DailyTaskListStore taskListStore, TriageDraftStore triageDraftStore)
        {
            _graphClient = factory.CreateClient("graph");
            _ollamaClient = factory.CreateClient("ollama");
            _groqClient = factory.CreateClient("groq");
            _healthStore = healthStore;
            _taskListStore = taskListStore;
            _triageDraftStore = triageDraftStore;

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

        public async Task<List<EmailItemDTO>> GetStructuredEmailsAsync(string? folderName = null)
        {
            var folderId = "inbox";
            if (!string.IsNullOrWhiteSpace(folderName) && !string.Equals(folderName, "Inbox", StringComparison.OrdinalIgnoreCase))
            {
                var resolvedId = await GetOrCreateFolderId(folderName);
                if (!string.IsNullOrEmpty(resolvedId)) folderId = resolvedId;
            }

            var messages = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/mailFolders/{folderId}/messages?$select=subject,from,body,receivedDateTime,isRead,webLink&$top=10"
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

            // GetRecentEmailsAsync already caps the text at 2000 chars; no need to re-truncate
            // further here (an earlier 800-char re-cap was cutting most emails out entirely).
            _cachedEmailContext = await GetRecentEmailsAsync();
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

                const int maxAttempts = 3;
                for (var attempt = 1; attempt <= maxAttempts; attempt++)
                {
                    var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions")
                    {
                        Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
                    };
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _groqApiKey);

                    var response = await _groqClient.SendAsync(request);
                    var responseText = await response.Content.ReadAsStringAsync();

                    using var doc = JsonDocument.Parse(responseText);
                    if (response.IsSuccessStatusCode && doc.RootElement.TryGetProperty("choices", out var choices))
                    {
                        return choices[0]
                            .GetProperty("message")
                            .GetProperty("content")
                            .GetString() ?? "No response";
                    }

                    var errorMessage = doc.RootElement.TryGetProperty("error", out var err) && err.TryGetProperty("message", out var msg)
                        ? msg.GetString() ?? responseText
                        : responseText;

                    // Groq's 429 body tells us exactly how long until the token bucket refills —
                    // honor it and retry instead of failing the whole triage/categorize pass over
                    // one rate-limited call. Other errors (auth, bad request) fail immediately.
                    if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests && attempt < maxAttempts)
                    {
                        var waitSeconds = 2.0;
                        var match = Regex.Match(errorMessage, @"try again in ([\d.]+)s");
                        if (match.Success && double.TryParse(match.Groups[1].Value, out var parsedWait))
                            waitSeconds = parsedWait;

                        await Task.Delay(TimeSpan.FromSeconds(waitSeconds + 0.5));
                        continue;
                    }

                    throw new InvalidOperationException($"Groq API error ({(int)response.StatusCode}): {errorMessage}");
                }

                throw new InvalidOperationException("Groq API error: exceeded retry attempts.");
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

        // Matches an explicit date reference in a chat message ("Jul 12", "July 12, 2026", "7/12",
        // "2026-07-12") or the words "today"/"yesterday", so date-specific questions can be answered
        // from that day's actual emails instead of whatever happens to be in the recent-10 window.
        private static readonly Regex DateMentionRegex = new(
            @"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b" +
            @"|\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b" +
            @"|\b\d{4}-\d{2}-\d{2}\b",
            RegexOptions.IgnoreCase);

        private static DateTime? ExtractDateFromMessage(string message, DateTime referenceNow)
        {
            var lower = message.ToLowerInvariant();
            if (lower.Contains("yesterday")) return referenceNow.Date.AddDays(-1);
            if (lower.Contains("today")) return referenceNow.Date;

            var match = DateMentionRegex.Match(message);
            if (!match.Success || !DateTime.TryParse(match.Value, out var parsed)) return null;

            // "Jul 12" has no year in the input; DateTime.TryParse defaults it to the current year,
            // which is already what we want since referenceNow.Year is "now".
            if (!Regex.IsMatch(match.Value, @"\d{4}"))
                parsed = new DateTime(referenceNow.Year, parsed.Month, parsed.Day);

            return parsed.Date;
        }

        public async Task<string> ChatAsync(string message)
        {
            var mentionedDate = ExtractDateFromMessage(message, DateTime.Now);
            if (mentionedDate.HasValue)
                return await ChatAboutDateAsync(message, mentionedDate.Value);

            var emailContext = await GetEmailContextAsync();

            var systemPrompt =
                "You are AutoPilot, a concise AI assistant. " +
                "Answer using the email context below. Keep replies short and actionable.\n\n" +
                $"EMAILS:\n{emailContext}";

            return await CallLLMAsync(systemPrompt, message);
        }

        private async Task<string> ChatAboutDateAsync(string message, DateTime date)
        {
            var emails = await GetEmailsOnDateAsync(date);
            var dateLabel = date.ToString("MMM d, yyyy");

            if (emails.Count == 0)
                return $"You have no emails on {dateLabel}.";

            var emailBlocks = emails.Select((e, i) =>
                $"Email {i + 1}:\n" +
                $"From: {e.From?.EmailAddress?.Name ?? "Unknown"}\n" +
                $"Subject: {e.Subject ?? "No Subject"}\n" +
                $"Body: {CapString(StripHtml(e.Body?.Content ?? ""), 1500)}"
            );

            var systemPrompt =
                "You are AutoPilot, a concise AI assistant. " +
                $"The user asked about their emails on {dateLabel}. Below is the FULL list of every " +
                $"email actually received that day ({emails.Count} total) — summarize EVERY one of " +
                "them individually as a separate numbered entry. Do not skip any email and do not " +
                "invent emails that are not listed below.\n\n" +
                $"EMAILS ON {dateLabel}:\n{string.Join("\n\n", emailBlocks)}";

            return await CallLLMAsync(systemPrompt, message);
        }

        // Fetches inbox emails received within [startInclusive, endExclusive) (both UTC), paging
        // through Graph's @odata.nextLink since a full day can exceed a single page of results.
        private async Task<List<ValueDTO>> FetchInboxEmailsInRangeAsync(DateTime startInclusive, DateTime endExclusive)
        {
            var start = startInclusive.ToString("yyyy-MM-ddTHH:mm:ssZ");
            var end = endExclusive.ToString("yyyy-MM-ddTHH:mm:ssZ");

            var url = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages" +
                       "?$select=subject,from,body,receivedDateTime,isRead" +
                       $"&$filter=receivedDateTime ge {start} and receivedDateTime lt {end}" +
                       "&$orderby=receivedDateTime desc&$top=100";

            var allEmails = new List<ValueDTO>();
            while (!string.IsNullOrEmpty(url))
            {
                var response = await _graphClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) break;

                var raw = await response.Content.ReadAsStringAsync();
                var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (parsed?.Value != null) allEmails.AddRange(parsed.Value);
                url = parsed?.NextLink ?? "";
            }

            return allEmails;
        }

        // Graph stores receivedDateTime in UTC, but the UI (and users) think in the server's local
        // calendar day (FormatReceivedTime renders in local time). A naive UTC-day window silently
        // misses/mismatches emails received near midnight, so convert the local day to its true UTC
        // range before querying.
        private static (DateTime StartUtc, DateTime EndUtc) LocalDayToUtcRange(DateTime localDate)
        {
            var startLocal = DateTime.SpecifyKind(localDate.Date, DateTimeKind.Unspecified);
            var startUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal, TimeZoneInfo.Local);
            var endUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal.AddDays(1), TimeZoneInfo.Local);
            return (startUtc, endUtc);
        }

        // All inbox emails received on the given local calendar day, as structured data —
        // used by the chatbot to answer date-specific questions per-email.
        private async Task<List<ValueDTO>> GetEmailsOnDateAsync(DateTime date)
        {
            var (startUtc, endUtc) = LocalDayToUtcRange(date);
            return await FetchInboxEmailsInRangeAsync(startUtc, endUtc);
        }

        // Fetches every inbox email received since the start of today (local calendar day).
        private async Task<string> GetTodaysEmailsAsync()
        {
            var (startOfDay, endOfDay) = LocalDayToUtcRange(DateTime.Now.Date);
            var allEmails = await FetchInboxEmailsInRangeAsync(startOfDay, endOfDay);

            var emailText = allEmails.Count > 0
                ? string.Join("\n\n", allEmails.Select(e =>
                    $"From: {e.From?.EmailAddress?.Name ?? "Unknown"}\n" +
                    $"Subject: {e.Subject ?? "No Subject"}\n" +
                    $"Body: {e.Body?.Content ?? "No Content"}"
                ))
                : "No emails found.";

            // Higher cap than the other 10-email flows: a full day's inbox is expected to be
            // larger, but this still bounds the prompt size sent to the LLM.
            return CapString(StripHtml(emailText), 8000);
        }

        // Tasks are generated once per local calendar day from that day's emails and cached in
        // DailyTaskListStore, so re-opening the dashboard doesn't re-run the LLM every time.
        public async Task<List<TaskItemDTO>> GetTasksAsync()
        {
            var today = DateTime.Now.Date;
            var store = await _taskListStore.LoadAsync();
            if (store.Date == today) return store.Tasks;

            var emailText = await GetTodaysEmailsAsync();
            var botSummary = await GetBotEmailSummary(emailText);
            var botText = botSummary.Message?.Body?.Content ?? "";

            var tasksSection = Regex.Match(botText, @"Tasks:\s*([\s\S]+?)(?:\n\n|$)");
            var tasks = tasksSection.Success
                ? Regex.Matches(tasksSection.Groups[1].Value, @"\d+\.\s+(.+)")
                    .Select(m => ParseTask(m.Groups[1].Value))
                    .ToList()
                : [];

            await _taskListStore.SaveAsync(new DailyTaskListData { Date = today, Tasks = tasks });
            return tasks;
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
            var today = DateTime.Now.ToString("yyyy-MM-dd");

            var systemPrompt =
                $"You are an AI productivity assistant. Today's date is {today}. Analyze emails and extract useful information.\n" +
                "Do NOT reply to the emails. ONLY extract insights.\n" +
                "Ignore duplicates. Identify actionable tasks.\n" +
                "Only list a task if it is explicitly requested or assigned in the emails below. " +
                "Do NOT infer, invent, or add tasks that were not actually mentioned, even if they seem like " +
                "reasonable next steps. If there are no actionable tasks, write exactly: Tasks:\nNone\n\n" +
                "For each task, judge priority using the SOURCE EMAIL's own urgency signals, not just the " +
                "rephrased task wording:\n" +
                "- High: the email uses urgency words (e.g. \"URGENT\", \"ASAP\", \"immediately\", \"critical\"), " +
                "explicitly says something is overdue / past due, or references a due date that is on or before " +
                $"{today}.\n" +
                "- Medium: the email references a deadline or timeframe that has NOT yet passed " +
                "(e.g. \"by Friday\", \"this week\", \"end of month\").\n" +
                "- Low: no explicit urgency word or deadline is mentioned.\n" +
                "Output format (STRICT):\n" +
                "Summary:\n- <brief summary>\n\n" +
                "Tasks:\n1. <task 1> [Priority: High|Medium|Low]\n2. <task 2> [Priority: High|Medium|Low]\n3. <task 3> [Priority: High|Medium|Low]";

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
                "Extract clear, actionable tasks from the transcript below.\n" +
                "Only include a task if it was explicitly stated or directly assigned in the transcript. " +
                "Do NOT infer, invent, or add tasks that were not actually mentioned, even if they seem like " +
                "reasonable next steps.\n" +
                "Output ONLY a numbered list. No preamble, no explanation.\n" +
                "Each task is a single concise sentence starting with an action verb, using only details present " +
                "in the transcript. List every actionable task found — there is no maximum.\n" +
                "If the transcript contains no actionable tasks, respond with exactly: Tasks:\nNone\n\n" +
                "Output format (STRICT):\nTasks:\n1. <task 1>\n2. <task 2>...";

            var text = await CallLLMAsync(systemPrompt, transcript);
            var taskMatches = Regex.Matches(text, @"\d+\.\s+(.+)");

            return taskMatches
                .Select(m => ParseTask(m.Groups[1].Value))
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

        // User-initiated: called when someone opens an email from the inbox list in the UI.
        public async Task<bool> MarkEmailReadAsync(string emailId)
        {
            var request = new HttpRequestMessage(HttpMethod.Patch, $"https://graph.microsoft.com/v1.0/me/messages/{emailId}")
            {
                Content = new StringContent(JsonSerializer.Serialize(new { isRead = true }), Encoding.UTF8, "application/json")
            };

            var response = await _graphClient.SendAsync(request);
            return response.IsSuccessStatusCode;
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
            var folderId = await GetOrCreateFolderId("To Categorize");
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
            var folderId = await GetOrCreateFolderId("To Categorize");
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

            var folderId = await GetOrCreateFolderId("To Categorize");
            if (string.IsNullOrEmpty(folderId)) return result;

            var messages = await GetFolderMessagesStructured(folderId);
            if (messages == null || messages.Count == 0) return result;

            var categories = ResolveCategories(await _healthStore.LoadAsync());

            var emailText = string.Join("\n\n", messages.Select(e =>
                $"Id: {e.Id}\n" +
                $"Subject: {e.Subject ?? "No Subject"}\n" +
                $"Body: {CapString(StripHtml(e.Body?.Content ?? ""), 300)}"));

            var systemPrompt = $"""
            You are an email classification engine.

            Your job is to classify each email into exactly one of the following categories:

            {string.Join("\n", categories.Select(c => $"- {c}"))}

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

                var validCategory = categories.FirstOrDefault(c => string.Equals(c, category, StringComparison.OrdinalIgnoreCase))
                    ?? "General Inquiry";
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

        // User-initiated: called when someone opens an item's detail view in the UI.
        // Fetches the full body live from Graph rather than from the store, since the
        // store never persists body content (only what's needed for deadline tracking).
        public async Task<EmailDetailDTO?> GetEmailDetailAsync(string emailId)
        {
            var response = await _graphClient.GetAsync(
                $"https://graph.microsoft.com/v1.0/me/messages/{emailId}?$select=id,subject,from,body,receivedDateTime,webLink");

            if (!response.IsSuccessStatusCode) return null;

            var raw = await response.Content.ReadAsStringAsync();
            var msg = JsonSerializer.Deserialize<ValueDTO>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (msg == null) return null;

            return new EmailDetailDTO
            {
                Id = msg.Id ?? emailId,
                Subject = msg.Subject ?? "No Subject",
                From = msg.From?.EmailAddress?.Name ?? "Unknown",
                ReceivedDateTime = DateTime.TryParse(msg.ReceivedDateTime, out var rdt) ? rdt.ToUniversalTime() : DateTime.UtcNow,
                Body = StripHtml(msg.Body?.Content ?? ""),
                WebLink = msg.WebLink
            };
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
            var categories = ResolveCategories(store);
            var now = DateTime.UtcNow;
            var seenIds = new HashSet<string>();
            var scannedCategories = new HashSet<string>();

            foreach (var category in categories)
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
            foreach (var category in categories)
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
            var categories = ResolveCategories(store);
            var now = DateTime.UtcNow;

            var response = new HealthMonitorResponseDTO { GeneratedAt = now };

            foreach (var category in categories)
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

        public async Task<List<CategoryListItemDTO>> GetCategoryListAsync()
        {
            var store = await _healthStore.LoadAsync();
            var custom = store.CustomCategories ?? [];

            return DefaultCategories
                .Select(c => new CategoryListItemDTO { Name = c, IsCustom = false })
                .Concat(custom.Select(c => new CategoryListItemDTO { Name = c, IsCustom = true }))
                .ToList();
        }

        // User-initiated: called when someone adds a folder from the Workflow Monitor UI.
        // Creates the matching Outlook folder immediately so it's ready for AI categorization.
        public async Task<CreateCategoryResultDTO> CreateCategoryAsync(string name)
        {
            name = name.Trim();
            if (string.IsNullOrEmpty(name))
                return new CreateCategoryResultDTO { Success = false, Error = "Folder name is required." };

            var store = await _healthStore.LoadAsync();
            store.CustomCategories ??= [];

            if (ResolveCategories(store).Any(c => string.Equals(c, name, StringComparison.OrdinalIgnoreCase)))
                return new CreateCategoryResultDTO { Success = false, Error = $"A folder named \"{name}\" already exists." };

            var folderId = await GetOrCreateFolderId(name);
            if (string.IsNullOrEmpty(folderId))
                return new CreateCategoryResultDTO { Success = false, Error = "Could not create the Outlook folder." };

            store.CustomCategories.Add(name);
            await _healthStore.SaveAsync(store);

            return new CreateCategoryResultDTO { Success = true };
        }

        // Only removes user-created folders — default categories aren't deletable. Deletes the
        // actual Outlook folder too (Graph moves it to Deleted Items, same as deleting it by hand
        // in Outlook — recoverable, not a hard delete), so tracking and Outlook stay in sync.
        public async Task<bool> DeleteCategoryAsync(string name)
        {
            var store = await _healthStore.LoadAsync();
            store.CustomCategories ??= [];

            var isCustom = store.CustomCategories.Any(c => string.Equals(c, name, StringComparison.OrdinalIgnoreCase));
            if (!isCustom) return false;

            var folderId = await GetFolderId(name);
            if (!string.IsNullOrEmpty(folderId))
            {
                var response = await _graphClient.DeleteAsync($"https://graph.microsoft.com/v1.0/me/mailFolders/{folderId}");
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Failed to delete Outlook folder '{name}'. Status: {response.StatusCode}");
                    return false;
                }
            }

            store.CustomCategories.RemoveAll(c => string.Equals(c, name, StringComparison.OrdinalIgnoreCase));
            await _healthStore.SaveAsync(store);

            return true;
        }

        public async Task<TriageRunResult> TriageInboxAsync()
        {
            var messages = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=subject,from,body,receivedDateTime,isRead&$top=15"
            );
            var raw = await messages.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var emails = parsed?.Value ?? [];
            var seenIds = new HashSet<string>(emails.Where(e => e.Id != null).Select(e => e.Id!));

            // Also triage emails already sorted into workflow folders (Finance, IT Support, etc.),
            // so pending items there get a reply/forward draft prepared too, not just the inbox.
            var categories = ResolveCategories(await _healthStore.LoadAsync());
            foreach (var category in categories)
            {
                var folderId = await GetOrCreateFolderId(category);
                if (string.IsNullOrEmpty(folderId)) continue;

                var folderResponse = await _graphClient.GetAsync(
                    $"https://graph.microsoft.com/v1.0/me/mailFolders/{folderId}/messages?$select=subject,from,body,receivedDateTime,isRead&$top=15"
                );
                if (!folderResponse.IsSuccessStatusCode) continue;

                var folderRaw = await folderResponse.Content.ReadAsStringAsync();
                var folderParsed = JsonSerializer.Deserialize<RecieveEmailDTO>(folderRaw,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                foreach (var msg in folderParsed?.Value ?? [])
                {
                    if (string.IsNullOrEmpty(msg.Id) || !seenIds.Add(msg.Id)) continue;
                    emails.Add(msg);
                }
            }

            var results = new List<TriageEmailResult>();

            foreach (var email in emails)
            {
                var result = await AnalyzeEmailAsync(email);
                results.Add(result);
            }

            return new TriageRunResult
            {
                Results = results,
                TotalAnalyzed = results.Count,
                DraftsPending = results.Count(r => r.DraftId != null),
                TasksCreated = results.Count(r => r.Action == "task_needed" && r.TaskText != null),
                NeedReview = results.Count(r => r.NeedsReview)
            };
        }
        
        private async Task<TriageEmailResult> AnalyzeEmailAsync(ValueDTO email)
        {
            var fromName = email.From?.EmailAddress?.Name ?? "Unknown";
            var fromAddr = email.From?.EmailAddress?.Address ?? "";
            var subject = email.Subject ?? "No Subject";
            var bodyText = CapString(StripHtml(email.Body?.Content ?? ""), 600);
            var received = FormatReceivedTime(email.ReceivedDateTime);

            var result = new TriageEmailResult
            {
                Id = email.Id ?? "",
                Subject = subject,
                From = fromName,
                FromAddress = fromAddr,
                Preview = CapString(bodyText, 120),
                ReceivedTime = received,
            };

            // Reuse a previous analysis if we have one, so re-running triage doesn't re-spend
            // LLM tokens (and risk rate limits) re-classifying emails it has already seen.
            // Drafted emails are cached indefinitely (cleared on approve/reject); everything
            // else expires after a few hours so a bad/ambiguous call eventually gets retried.
            var draftStore = await _triageDraftStore.LoadAsync();
            if (!string.IsNullOrEmpty(result.Id) && draftStore.Drafts.TryGetValue(result.Id, out var cached))
            {
                var isStale = cached.DraftId == null && (DateTime.UtcNow - cached.AnalyzedAt) > TimeSpan.FromHours(6);
                if (!isStale)
                {
                    result.Action = cached.Action;
                    result.Confidence = cached.Confidence;
                    result.Reasoning = cached.Reasoning;
                    result.NeedsReview = cached.NeedsReview;
                    result.TaskText = cached.TaskText;
                    result.DraftId = cached.DraftId;
                    result.DraftSubject = cached.DraftSubject;
                    result.DraftBody = cached.DraftBody;
                    result.DraftTo = cached.DraftTo;
                    return result;
                }
            }

            var systemPrompt = """
                You are an intelligent email triage assistant. Analyze the email and decide the best action.

                Respond with ONLY valid JSON (no markdown, no code fences) in this exact format:
                {
                  "action": "reply_needed",
                  "confidence": 0.85,
                  "reasoning": "one sentence explaining why",
                  "draftContent": "full draft text if reply_needed or forward_needed, else null",
                  "draftTo": "email address if forward_needed, else null",
                  "taskText": "task description if task_needed, else null"
                }

                Action rules:
                - "reply_needed": email clearly expects a response from us (question, request, invitation)
                - "forward_needed": another team or person should handle this (wrong recipient, specialized request)
                - "task_needed": we need to complete an action (fill a form, submit something, schedule something)
                - "info_only": no action needed, purely informational (newsletters, confirmations, FYI)

                Confidence rules:
                - 0.90-1.00: completely clear, unambiguous action
                - 0.70-0.89: likely correct, one dominant interpretation
                - 0.50-0.69: uncertain, could go multiple ways
                - below 0.50: very ambiguous, needs human review

                For reply_needed: write a professional, concise reply draft. Start with a greeting.
                For forward_needed: write a forwarding note explaining why you're forwarding and what needs to be done. Set draftTo to the best guessed team email based on context.
                For task_needed: extract the specific task as a clear action sentence.
                """;

            var userPrompt = $"From: {fromName} <{fromAddr}>\nSubject: {subject}\n\n{bodyText}";

            try
            {
                var llmRaw = await CallLLMAsync(systemPrompt, userPrompt);

                // Strip markdown code fences if present
                var json = Regex.Match(llmRaw, @"\{[\s\S]*\}").Value;
                if (string.IsNullOrEmpty(json)) json = llmRaw;

                var analysis = JsonSerializer.Deserialize<LlmTriageResult>(json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (analysis == null)
                {
                    result.Action = "info_only";
                    result.Confidence = 0.3;
                    result.Reasoning = "Could not parse AI response.";
                    result.NeedsReview = true;
                    return result;
                }

                result.Action = analysis.action ?? "info_only";
                result.Confidence = Math.Clamp(analysis.confidence, 0.0, 1.0);
                result.Reasoning = analysis.reasoning ?? "";
                result.NeedsReview = result.Confidence < 0.60;
                result.TaskText = analysis.taskText;

                // Always draft when the AI produced reply/forward content — low-confidence
                // emails still get NeedsReview=true so the UI flags them, but the user gets
                // an editable draft to review instead of nothing to work from.
                if (analysis.draftContent != null &&
                    (result.Action == "reply_needed" || result.Action == "forward_needed") &&
                    !string.IsNullOrEmpty(result.Id))
                {
                    var toAddress = result.Action == "reply_needed" ? fromAddr : (analysis.draftTo ?? fromAddr);
                    var draftSubject = result.Action == "reply_needed" ? $"Re: {subject}" : $"Fwd: {subject}";

                    var (draftId, draftBody) = await CreateOutlookDraftAsync(
                        draftSubject, analysis.draftContent, toAddress);

                    result.DraftId = draftId;
                    result.DraftSubject = draftSubject;
                    result.DraftBody = draftBody;
                    result.DraftTo = toAddress;
                }

                // Cache the successful classification (draft or not) so a re-run of triage can
                // skip the LLM call for this email entirely next time.
                if (!string.IsNullOrEmpty(result.Id))
                {
                    draftStore.Drafts[result.Id] = new TriageDraftRecord
                    {
                        Action = result.Action,
                        Confidence = result.Confidence,
                        Reasoning = result.Reasoning,
                        NeedsReview = result.NeedsReview,
                        TaskText = result.TaskText,
                        DraftId = result.DraftId,
                        DraftSubject = result.DraftSubject,
                        DraftBody = result.DraftBody,
                        DraftTo = result.DraftTo,
                        AnalyzedAt = DateTime.UtcNow
                    };
                    await _triageDraftStore.SaveAsync(draftStore);
                }
            }
            catch (Exception ex)
            {
                // Transient failures (rate limits, network errors) are not cached — the email
                // is simply retried on the next triage run instead of being permanently
                // mislabeled as info_only.
                Console.WriteLine($"Triage error for '{subject}': {ex.Message}");
                result.Action = "info_only";
                result.Confidence = 0.3;
                result.Reasoning = "Analysis failed. Manual review recommended.";
                result.NeedsReview = true;
            }

            return result;
        }

        private async Task<(string? draftId, string? draftBody)> CreateOutlookDraftAsync(
            string subject, string body, string toAddress)
        {
            var draftPayload = new
            {
                subject,
                body = new { contentType = "Text", content = body },
                toRecipients = new[]
                {
                    new { emailAddress = new { address = toAddress } }
                }
            };

            var content = new StringContent(
                JsonSerializer.Serialize(draftPayload), Encoding.UTF8, "application/json");

            var response = await _graphClient.PostAsync(
                "https://graph.microsoft.com/v1.0/me/messages", content);

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Draft creation failed: {response.StatusCode}");
                return (null, null);
            }

            var responseText = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(responseText);
            var id = doc.RootElement.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            return (id, body);
        }

        public async Task<bool> ApproveDraftAsync(string draftId, string? editedBody, string? editedSubject, string? editedTo)
        {
            var updatePayload = new Dictionary<string, object>();

            if (!string.IsNullOrWhiteSpace(editedBody))
            {
                updatePayload["body"] = new
                {
                    contentType = "Text",
                    content = editedBody
                };
            }

            if (!string.IsNullOrWhiteSpace(editedSubject))
            {
                updatePayload["subject"] = editedSubject;
            }

            if (!string.IsNullOrWhiteSpace(editedTo))
            {
                updatePayload["toRecipients"] = new[]
                {
                    new
                    {
                        emailAddress = new
                        {
                            address = editedTo
                        }
                    }
                };
            }

            if (updatePayload.Count > 0)
            {
                var patchReq = new HttpRequestMessage(
                    HttpMethod.Patch,
                    $"https://graph.microsoft.com/v1.0/me/messages/{draftId}")
                {
                    Content = new StringContent(
                        JsonSerializer.Serialize(updatePayload),
                        Encoding.UTF8,
                        "application/json")
                };

                await _graphClient.SendAsync(patchReq);
            }

            var sendResponse = await _graphClient.PostAsync(
                $"https://graph.microsoft.com/v1.0/me/messages/{draftId}/send",
                new StringContent(""));

            if (sendResponse.IsSuccessStatusCode) await RemoveTriageDraftRecordAsync(draftId);

            return sendResponse.IsSuccessStatusCode;
        }

        public async Task<bool> RejectDraftAsync(string draftId)
        {
            var response = await _graphClient.DeleteAsync(
                $"https://graph.microsoft.com/v1.0/me/messages/{draftId}");

            if (response.IsSuccessStatusCode) await RemoveTriageDraftRecordAsync(draftId);

            return response.IsSuccessStatusCode;
        }

        // Clears the idempotency record once a draft is sent or rejected, so if the same
        // source email is ever seen again it's eligible to be drafted fresh.
        private async Task RemoveTriageDraftRecordAsync(string draftId)
        {
            var store = await _triageDraftStore.LoadAsync();
            var sourceIds = store.Drafts.Where(kv => kv.Value.DraftId == draftId).Select(kv => kv.Key).ToList();
            if (sourceIds.Count == 0) return;

            foreach (var id in sourceIds) store.Drafts.Remove(id);
            await _triageDraftStore.SaveAsync(store);
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
                    // var now = DateTime.Now;

                    // if (now.Hour >= 9 && lastSummaryRun.Date != now.Date)
                    // {
                    //     Console.WriteLine("Sending Daily Summary...");

                    //     var recentEmails = await GetRecentEmailsAsync();
                    //     var getBotSummary = await GetBotEmailSummary(recentEmails);

                    //     await SendTasksEmailToOutLook(getBotSummary);

                    //     lastSummaryRun = now;
                    // }
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

        private static readonly Regex PriorityTagRegex = new(@"\s*\[\s*Priority\s*:\s*(High|Medium|Low)\s*\]\s*", RegexOptions.IgnoreCase);

        // The LLM is asked to append an inline "[Priority: High|Medium|Low]" tag per task.
        // When present, trust it (and strip it from the displayed text) instead of re-guessing
        // priority from keywords — the model has the full email context, the keyword heuristic doesn't.
        private static TaskItemDTO ParseTask(string raw)
        {
            var tagMatch = PriorityTagRegex.Match(raw);
            if (!tagMatch.Success)
                return new TaskItemDTO { Text = raw.Trim(), Priority = DetectPriority(raw) };

            var text = PriorityTagRegex.Replace(raw, "").Trim();
            return new TaskItemDTO { Text = text, Priority = tagMatch.Groups[1].Value.ToLowerInvariant() };
        }

        private static string DetectPriority(string text)
        {
            var lower = text.ToLower();
            if (lower.Contains("urgent") || lower.Contains("asap") || lower.Contains("immediately") || lower.Contains("today") || lower.Contains("deadline") || lower.Contains("overdue") || lower.Contains("past due") || lower.Contains("critical"))
                return "high";
            if (lower.Contains("soon") || lower.Contains("week") || lower.Contains("friday") || lower.Contains("review") || lower.Contains("prepare"))
                return "medium";
            return "low";
        }
    }
}
