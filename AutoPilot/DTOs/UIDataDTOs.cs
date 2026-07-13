namespace AutoPilot.DTOs
{
    public class EmailItemDTO
    {
        public string? Id { get; set; }
        public string? From { get; set; }
        public string? Subject { get; set; }
        public string? Preview { get; set; }
        public string? ReceivedTime { get; set; }
        public bool Unread { get; set; }
        public string? WebLink { get; set; }
    }

    public class CalendarEventDTO
    {
        public string? Id { get; set; }
        public string? Title { get; set; }
        public string? Start { get; set; }
        public string? End { get; set; }
        public int Attendees { get; set; }
    }

    public class TaskItemDTO
    {
        public string? Text { get; set; }
        public string Priority { get; set; } = "medium";
    }

    public class ChatRequestDTO
    {
        public string? Message { get; set; }
    }

    public class ChatResponseDTO
    {
        public string? Reply { get; set; }
    }

    public class TranscriptTasksRequestDTO
    {
        public string? Transcript { get; set; }
        public string Model { get; set; } = "gpt-4o";
    }

    public class TranscriptTasksResponseDTO
    {
        public List<TaskItemDTO> Tasks { get; set; } = [];
        public string? Transcript { get; set; }
    }

    public class WorkflowRequestDTO
    {
        public List<string> Categories { get; set; } = [];
    }

    public class WorkflowResultDTO
    {
        public string EmailId { get; set; } = "";
        public string Category { get; set; } = "";
        public bool Moved { get; set; }
    }

    // Graph API calendar response shapes
    public class CalendarApiResponse
    {
        public List<CalendarApiEvent>? Value { get; set; }
    }

    public class CalendarApiEvent
    {
        public string? Id { get; set; }
        public string? Subject { get; set; }
        public CalendarApiTime? Start { get; set; }
        public CalendarApiTime? End { get; set; }
        public List<CalendarApiAttendee>? Attendees { get; set; }
    }

    public class CalendarApiTime
    {
        public string? DateTime { get; set; }
        public string? TimeZone { get; set; }
    }

    public class CalendarApiAttendee
    {
        public CalendarApiEmail? EmailAddress { get; set; }
    }

    public class CalendarApiEmail
    {
        public string? Name { get; set; }
        public string? Address { get; set; }
    }
}
