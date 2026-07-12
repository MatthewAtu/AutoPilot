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
        Task<List<MailFolderDTO>> GetMailFoldersAsync();
        Task<bool> MoveEmailToFolderAsync(string emailId, string folderName);
        Task<bool> MarkEmailReadAsync(string emailId);
        Task<List<PendingEmailDTO>> GetPendingCategorizeEmailsAsync();
        Task<CategorizeResultDTO> CategorizeCompletedEmails();
        Task RefreshHealthMonitorAsync();
        Task<HealthMonitorResponseDTO> GetHealthMonitorSnapshot();
        Task<bool> MarkEmailCompleteAsync(string emailId);
        Task<EmailDetailDTO?> GetEmailDetailAsync(string emailId);
    }
}
