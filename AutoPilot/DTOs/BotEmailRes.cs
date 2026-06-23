namespace AutoPilot.DTOs
{
    public class BotEmailRes
    {
        //model
        public string? Model { get; set; }
        //created at
        public string? Created_at { get; set; }
        //message, role, assistant, content
        public BotMessageDto? Message { get; set; }
    }

    public class BotMessageDto
    {
        public string? Role { get; set; }
        public string? Assistant { get; set; }
        public string? Content { get; set; }
    }
}
