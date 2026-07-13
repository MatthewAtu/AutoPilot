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

            var systemPrompt =
                "You are an AI productivity assistant. Analyze emails and extract actionable tasks.\n" +
                "Output ONLY a numbered list. No preamble, no explanation.\n" +
                "Each task is a single concise sentence starting with an action verb. Maximum 10 tasks.\n\n" +
                "Output format (STRICT):\nTasks:\n1. <task 1>\n2. <task 2>";

            var llmResponse = await CallLLMAsync(systemPrompt, emailText);

            var tasksSection = Regex.Match(llmResponse, @"Tasks:\s*([\s\S]+?)(?:\n\n|$)");
            var source = tasksSection.Success ? tasksSection.Groups[1].Value : llmResponse;
            var taskMatches = Regex.Matches(source, @"\d+\.\s+(.+)");

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

            var match = parsedReturn?.Value?
                .FirstOrDefault(f => string.Equals(f.DisplayName, DisplayName, StringComparison.OrdinalIgnoreCase));

            if (match?.Id != null)
                return match.Id;

            // Folder doesn't exist — create it
            var createBody = new StringContent(
                JsonSerializer.Serialize(new { displayName = DisplayName }),
                Encoding.UTF8,
                "application/json");

            var createResponse = await _graphClient.PostAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders",
                createBody);

            if (!createResponse.IsSuccessStatusCode)
            {
                Console.WriteLine($"Failed to create folder '{DisplayName}': {createResponse.StatusCode}");
                return "";
            }

            var created = await createResponse.Content.ReadAsStringAsync();
            var createdFolder = JsonSerializer.Deserialize<JsonElement>(created);
            return createdFolder.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
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
                        $"Id: {e?.Id ?? "Unknown"}\n" +
                        $"From: {e?.Name ?? "Unknown"}\n" +
                        $"Subject: {e?.Subject ?? "No Subject"}\n" +
                        $"Body: {e?.Content ?? "No Content"}"
                    )
                )
                : "No emails found.";
        
            return CapString(StripHtml(emailText));
        }

        public async Task<List<WorkflowResultDTO>> CategorizeCompletedEmails(List<string> categories)
        {
            var emails = await GetCompletedEmails();

            if (emails == "No emails found.")
                return [];

            var categoryList = string.Join(", ", categories);
            var fallback = categories.LastOrDefault() ?? "General Inquiry";

            // Extract email IDs from the raw text before calling the LLM
            var idMatches = Regex.Matches(emails, @"^Id:\s*(.+)$", RegexOptions.Multiline);
            var emailIds = idMatches.Select(m => m.Groups[1].Value.Trim()).ToList();

            var systemPrompt = $"""
            You are an email classifier. You will receive one or more emails separated by blank lines.
            Classify each email into exactly one of these categories: {categoryList}.

            Rules:
            - Reply with ONLY the category names, one per line, in the same order as the emails.
            - Do not include IDs, numbers, punctuation, or any explanation.
            - If an email does not fit any category, use "{fallback}".
            """;

            var userPrompt = $"Emails:\n\n{emails}";

            var llmResponse = await CallLLMAsync(systemPrompt, userPrompt);

            // Parse: one category per line, matched positionally to emailIds
            var categoryLines = llmResponse
                .Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim().TrimStart('-', '*', '•').Trim())
                .Where(l => l.Length > 0)
                .ToList();

            var results = new List<WorkflowResultDTO>();
            for (int i = 0; i < emailIds.Count; i++)
            {
                var messageId = emailIds[i];
                var rawCategory = categoryLines.Count > i ? categoryLines[i] : fallback;
                // snap to nearest known category; fall back if LLM hallucinated
                var category = categories.FirstOrDefault(c =>
                    rawCategory.Contains(c, StringComparison.OrdinalIgnoreCase)) ?? fallback;

                if (string.IsNullOrWhiteSpace(messageId)) continue;

                var destinationFolderId = await GetFolderId(category);
                bool moved = false;

                if (!string.IsNullOrEmpty(destinationFolderId))
                {
                    var requestBody = new StringContent(
                        JsonSerializer.Serialize(new MoveRequestDTO { DestinationId = destinationFolderId }),
                        Encoding.UTF8,
                        "application/json");

                    var response = await _graphClient.PostAsync(
                        $"https://graph.microsoft.com/v1.0/me/messages/{messageId}/move",
                        requestBody);

                    moved = response.IsSuccessStatusCode;
                    Console.WriteLine(moved
                        ? $"Moved '{messageId}' → '{category}'"
                        : $"Failed to move '{messageId}' → '{category}' ({response.StatusCode})");
                }

                results.Add(new WorkflowResultDTO { EmailId = messageId, Category = category, Moved = moved });
            }

            return results;
        }

        public async Task<List<string>> GetMailFoldersAsync()
        {
            var response = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders?$select=displayName&$top=50");
            var content = await response.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(content,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return parsed?.Value?
                .Where(f => !string.IsNullOrEmpty(f.DisplayName))
                .Select(f => f.DisplayName!)
                .OrderBy(n => n)
                .ToList() ?? [];
        }

        // ─── Smart Triage ────────────────────────────────────────────────────────

        public async Task<TriageRunResult> TriageInboxAsync()
        {
            var messages = await _graphClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=subject,from,body,receivedDateTime,isRead&$top=15"
            );
            var raw = await messages.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<RecieveEmailDTO>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var emails = parsed?.Value ?? [];
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

                // Create Outlook draft if confidence is sufficient
                if (!result.NeedsReview && analysis.draftContent != null &&
                    (result.Action == "reply_needed" || result.Action == "forward_needed"))
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
            }
            catch (Exception ex)
            {
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

        public async Task<bool> ApproveDraftAsync(string draftId, string? editedBody)
        {
            if (!string.IsNullOrEmpty(editedBody))
            {
                var updatePayload = new
                {
                    body = new { contentType = "Text", content = editedBody }
                };
                var patchContent = new StringContent(
                    JsonSerializer.Serialize(updatePayload), Encoding.UTF8, "application/json");
                var patchReq = new HttpRequestMessage(new HttpMethod("PATCH"),
                    $"https://graph.microsoft.com/v1.0/me/messages/{draftId}")
                {
                    Content = patchContent
                };
                await _graphClient.SendAsync(patchReq);
            }

            var sendResponse = await _graphClient.PostAsync(
                $"https://graph.microsoft.com/v1.0/me/messages/{draftId}/send",
                new StringContent(""));

            return sendResponse.IsSuccessStatusCode;
        }

        public async Task<bool> RejectDraftAsync(string draftId)
        {
            var response = await _graphClient.DeleteAsync(
                $"https://graph.microsoft.com/v1.0/me/messages/{draftId}");
            return response.IsSuccessStatusCode;
        }

        // ─────────────────────────────────────────────────────────────────────────

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

                // Daily summary logging only — no emails sent without user approval
                Console.WriteLine("Daily summary tick (no auto-send).");
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
