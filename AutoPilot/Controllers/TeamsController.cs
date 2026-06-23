// retreies the data from Outlook and teams then sends it to the chatbot 
// the chatbot then sends the data back and puts it into the ne autopilot chat section
using AutoPilot.DTOs;
using AutoPilot.Service;
using Microsoft.AspNetCore.Mvc;

namespace AutoPilot.Controllers
{
    [ApiController]
    [Route("")]
    public class TeamsController : ControllerBase
    {
        private readonly SummaryService _SummaryService;
        public TeamsController(SummaryService summaryService)
        {
            _SummaryService = summaryService;
        }

        /// <summary>
        /// this method gets the last 10 messages from the outlook inbox
        /// next step is to send the data to the chat bot
        /// </summary>
        /// <returns>message data from the last 10 outlook emails</returns>
        [HttpGet("api/emails")]
        public async Task<IActionResult> GetEmailsAsync()
        {
            var emails = await _SummaryService.GetRecentEmailsAsync();
            var botEmail = await _SummaryService.GetBotEmailSummary(emails);
            await _SummaryService.SendTasksEmailToOutLook(botEmail);
            return Ok(emails);
        }

        [HttpPost("api/sendEmail")]
        public async Task<IActionResult> SendTasksEmail([FromBody] SendEmailDTO email)
        {
            var sendEmail = await _SummaryService.SendTasksEmailToOutLook(email);
            
            return Ok(sendEmail);
        }
    }
}