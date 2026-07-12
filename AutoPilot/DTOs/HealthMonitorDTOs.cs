namespace AutoPilot.DTOs
{
    // Persisted record for a single tracked email (stored in the JSON file)
    public class TrackedEmailRecord
    {
        public string Id { get; set; } = "";
        public string Category { get; set; } = "";
        public string Subject { get; set; } = "";
        public string From { get; set; } = "";
        public DateTime ReceivedDateTime { get; set; }
        public DateTime? Deadline { get; set; }
        public DateTime FirstSeenAt { get; set; }
        public DateTime LastCheckedAt { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public string? ResolutionReason { get; set; } // "AICompleted" | "MissingFromFolder"
    }

    // A point-in-time rollup of overdue/warning counts per category, appended over time
    public class HealthHistorySnapshot
    {
        public DateTime Timestamp { get; set; }
        public Dictionary<string, int> OverdueByCategory { get; set; } = new();
        public Dictionary<string, int> WarningByCategory { get; set; } = new();
    }

    // Root of the JSON store file
    public class HealthMonitorStoreData
    {
        public Dictionary<string, TrackedEmailRecord> Emails { get; set; } = new();
        public List<HealthHistorySnapshot> History { get; set; } = [];
    }

    // API response shapes
    public class EmailHealthDTO
    {
        public string Id { get; set; } = "";
        public string Subject { get; set; } = "";
        public string From { get; set; } = "";
        public string Category { get; set; } = "";
        public DateTime ReceivedDateTime { get; set; }
        public DateTime? Deadline { get; set; }
        public string Status { get; set; } = "OnTrack"; // OnTrack | Warning | Overdue
        public double AgeHours { get; set; }
    }

    public class CategoryHealthDTO
    {
        public string Category { get; set; } = "";
        public int Total { get; set; }
        public int OnTrack { get; set; }
        public int Warning { get; set; }
        public int Overdue { get; set; }
        public double AvgAgeHours { get; set; }
        public List<EmailHealthDTO> Emails { get; set; } = [];
    }

    public class HistorySnapshotDTO
    {
        public DateTime Timestamp { get; set; }
        public Dictionary<string, int> OverdueByCategory { get; set; } = new();
        public Dictionary<string, int> WarningByCategory { get; set; } = new();
    }

    public class MarkCompleteRequestDTO
    {
        public string EmailId { get; set; } = "";
    }

    public class CompletedEmailDTO
    {
        public string Id { get; set; } = "";
        public string Subject { get; set; } = "";
        public string From { get; set; } = "";
        public string Category { get; set; } = "";
        public DateTime ResolvedAt { get; set; }
    }

    public class HealthMonitorResponseDTO
    {
        public DateTime GeneratedAt { get; set; }
        public List<CategoryHealthDTO> Categories { get; set; } = [];
        public List<EmailHealthDTO> OverdueItems { get; set; } = [];
        public List<HistorySnapshotDTO> History { get; set; } = [];
        public List<CompletedEmailDTO> RecentlyCompleted { get; set; } = [];
    }

    // Full email content, fetched live from Graph when a user opens an item's detail view
    public class EmailDetailDTO
    {
        public string Id { get; set; } = "";
        public string Subject { get; set; } = "";
        public string From { get; set; } = "";
        public DateTime ReceivedDateTime { get; set; }
        public string Body { get; set; } = "";
        public string? WebLink { get; set; }
    }
}
