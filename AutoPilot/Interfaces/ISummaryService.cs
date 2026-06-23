using AutoPilot.DTOs;

namespace AutoPilot.interfaces
{
    public interface ISummaryService
    {
        Task<string> GetRecentEmailsAsync();
        Task<bool> SendTasksEmailToOutLook(SendEmailDTO email);
        Task<SendEmailDTO> GetBotEmailSummary(string promt);
    }
}
