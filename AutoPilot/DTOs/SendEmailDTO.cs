namespace AutoPilot.DTOs
{
    public class SendEmailDTO
    {
        public MessageDto? Message { get; set; }
    }

    public class MessageDto
    {
        public string? Subject { get; set; } 
        public BodyDto? Body { get; set; }
        public List<RecipientDto>? ToRecipients { get; set; }
    }

    public class BodyDto
    {
        public string? ContentType { get; set; }
        public string? Content { get; set; }
    }

    public class RecipientDto
    {
        public EmailAddressDto? EmailAddress { get; set; }
    }

    public class EmailAddressDto
    {
        public string? Name { get; set; }
        public string? Address { get; set; }
    }
}