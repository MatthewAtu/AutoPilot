using AutoPilot.DTOs;

namespace AutoPilot.interfaces
{
    public interface ISummaryService
    {
        Task<string> GetRecentEmailsAsync();
        Task<bool> SendTasksEmailToOutLook(SendEmailDTO email);
        Task<SendEmailDTO> GetBotEmailSummary(string prompt);
        Task<List<EmailItemDTO>> GetStructuredEmailsAsync();
        Task<List<CalendarEventDTO>> GetCalendarEventsAsync();
        Task<string> ChatAsync(string message);
        Task<List<TaskItemDTO>> GetTasksAsync();
    }
}
