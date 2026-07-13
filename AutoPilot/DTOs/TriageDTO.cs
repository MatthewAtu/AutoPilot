namespace AutoPilot.DTOs
{
    public class TriageEmailResult
    {
        public string Id { get; set; } = "";
        public string Subject { get; set; } = "";
        public string From { get; set; } = "";
        public string FromAddress { get; set; } = "";
        public string Preview { get; set; } = "";
        public string ReceivedTime { get; set; } = "";
        public string Action { get; set; } = "info_only"; // reply_needed | forward_needed | task_needed | info_only
        public double Confidence { get; set; }
        public string Reasoning { get; set; } = "";
        public bool NeedsReview { get; set; }
        public string? DraftId { get; set; }
        public string? DraftSubject { get; set; }
        public string? DraftBody { get; set; }
        public string? DraftTo { get; set; }
        public string? TaskText { get; set; }
    }

    public class TriageRunResult
    {
        public List<TriageEmailResult> Results { get; set; } = [];
        public int TotalAnalyzed { get; set; }
        public int DraftsPending { get; set; }
        public int TasksCreated { get; set; }
        public int NeedReview { get; set; }
    }

    public class ApproveActionDTO
    {
        public string DraftId { get; set; } = "";
        public string? EditedBody { get; set; }
        public string? EditedSubject { get; set; }
        public string? EditedTo { get; set; }
    }

    internal class LlmTriageResult
    {
        public string action { get; set; } = "info_only";
        public double confidence { get; set; }
        public string reasoning { get; set; } = "";
        public string? draftContent { get; set; }
        public string? draftTo { get; set; }
        public string? taskText { get; set; }
    }

    // Persisted record linking a source email to the Outlook draft already created for it,
    // so re-running triage doesn't create a duplicate draft for the same email.
    public class TriageDraftRecord
    {
        public string DraftId { get; set; } = "";
        public string DraftSubject { get; set; } = "";
        public string DraftBody { get; set; } = "";
        public string DraftTo { get; set; } = "";
    }

    public class TriageDraftStoreData
    {
        public Dictionary<string, TriageDraftRecord> Drafts { get; set; } = new();
    }
}