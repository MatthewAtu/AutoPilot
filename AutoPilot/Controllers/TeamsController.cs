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

        [HttpGet("api/emails")]
        public async Task<IActionResult> GetEmailsAsync()
        {
            var emails = await _SummaryService.GetRecentEmailsAsync();
            var botEmail = await _SummaryService.GetBotEmailSummary(emails);
            await _SummaryService.SendTasksEmailToOutLook(botEmail);
            return Ok(emails);
        }

        [HttpGet("api/emails/list")]
        public async Task<IActionResult> GetStructuredEmailsAsync()
        {
            var emails = await _SummaryService.GetStructuredEmailsAsync();
            return Ok(emails);
        }

        [HttpGet("api/calendar/events")]
        public async Task<IActionResult> GetCalendarEventsAsync()
        {
            var events = await _SummaryService.GetCalendarEventsAsync();
            return Ok(events);
        }

        [HttpPost("api/chat")]
        public async Task<IActionResult> Chat([FromBody] ChatRequestDTO request)
        {
            if (string.IsNullOrEmpty(request.Message))
                return BadRequest("Message is required");

            var reply = await _SummaryService.ChatAsync(request.Message);
            return Ok(new ChatResponseDTO { Reply = reply });
        }

        [HttpGet("api/tasks")]
        public async Task<IActionResult> GetTasksAsync()
        {
            var tasks = await _SummaryService.GetTasksAsync();
            return Ok(tasks);
        }

        [HttpPost("api/sendEmail")]
        public async Task<IActionResult> SendTasksEmail([FromBody] SendEmailDTO email)
        {
            var sendEmail = await _SummaryService.SendTasksEmailToOutLook(email);
            return Ok(sendEmail);
        }
    }
}
