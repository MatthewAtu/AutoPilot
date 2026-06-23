// here is where the apis are called (chatbot/azure devops)
using AutoPilot.DTOs;
using AutoPilot.interfaces;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AutoPilot.Service
{
    public class SummaryService : ISummaryService
    {
        private readonly HttpClient _HttpClient;
        private readonly GraphAuthService _authService;

        public SummaryService(HttpClient httpClient, GraphAuthService authService, IConfiguration Config)
        {
            _HttpClient = httpClient;
            _authService = authService;


            var token = Config["Graph:AccessToken"];
            _HttpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        private async Task SetAuthHeaderAsync()
        {
            var token = await _authService.GetAccessTokenAsync();
            _HttpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        public async Task<string> GetRecentEmailsAsync()
        {
            //await SetAuthHeaderAsync();

            var messages = await _HttpClient.GetAsync(
                "https://graph.microsoft.com/v1.0/me/messages?$select=subject,from,body&$top=10"
            );

            var returnedEmails = await messages.Content.ReadAsStringAsync();

            var parsedReturn = JsonSerializer.Deserialize<RecieveEmailDTO>(returnedEmails,
            new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }
            );

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

            var htmlStrippedEmail = StripHtml(emailText );

            var cappedEmailText = CapString(htmlStrippedEmail);

            Console.WriteLine(cappedEmailText);

            return cappedEmailText;
        }


        public async Task<bool> SendTasksEmailToOutLook(SendEmailDTO email)
        {
            //await SetAuthHeaderAsync();

            var requestJson = JsonSerializer.Serialize(email);
            
            var content = new StringContent(
                requestJson,
                Encoding.UTF8,
                "application/json"
            );

            var SendEmail = await _HttpClient.PostAsync(
                "https://graph.microsoft.com/v1.0/me/sendMail",
                content
            );

            return SendEmail.IsSuccessStatusCode;
        }

        public async Task<SendEmailDTO> GetBotEmailSummary(string prompt)
        {
            //await SetAuthHeaderAsync();
       
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
                - Add more tasks if neccesary.

                Output format (STRICT):
                Summary:
                - <brief summary of all emails>

                Tasks:
                1. <task 1>
                2. <task 2>
                3. <task 3>
                

                Emails:
                {prompt}
                ";

            var test = "hey how are you?" +
                        "";
            var Requestbody = new
            {
                model = "llama3",
                messages = new[]
                {
                    new { role = "user", content = llamaPrompt }
                },
                stream = false
            };

            var requestJson = JsonSerializer.Serialize(Requestbody);

            var content = new StringContent(
                requestJson,
                Encoding.UTF8,
                "application/json"
            ); 

            var sendToBot = await _HttpClient.PostAsync(
                "http://localhost:11434/api/chat",
                content
            );

            var botEmailResponse = await sendToBot.Content.ReadAsStringAsync();

            var parsedReturn = JsonSerializer.Deserialize<BotEmailRes>(botEmailResponse,
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }
            );

            var cleanedResponse = parsedReturn?.Message?.Content;

            return new SendEmailDTO
            {
                Message = new MessageDto
                {
                    Subject = "Daily Summary Test",
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
                              Name = "Atu, Matthew (MPBSDP)",
                              Address = "matthew.atu@ontario.ca"
                            }
                        }
                    ]
                }
            };
            }
            public async Task WarmUpModelAsync()
            {
                var httpClient = new HttpClient();

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

                await httpClient.PostAsync(
                    "http://localhost:11434/api/generate",
                    content
                );
            }
            public static string CapString(string input, int maxLength = 2000)
            {
                if (string.IsNullOrEmpty(input))
                    return input;

                return input.Length > maxLength
                    ? input[..maxLength]
                    : input;
            }

            public static string StripHtml(string html)
            {
            html = Regex.Replace(html, "<!--.*?-->", string.Empty, RegexOptions.Singleline);
            html = Regex.Replace(html, "<.*?>", string.Empty);
                return WebUtility.HtmlDecode(html);
            }


    }
}
