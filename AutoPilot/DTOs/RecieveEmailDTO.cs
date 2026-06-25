namespace AutoPilot.DTOs
{
    public class RecieveEmailDTO
    {
        public List<ValueDTO>? Value { get; set; }
    }

    public class ValueDTO
    {
        public string? Id { get; set; }
        public string? Subject { get; set; }
        public BodyDto? Body { get; set; }
        public FromDTO? From { get; set; }
        public string? ReceivedDateTime { get; set; }
        public bool IsRead { get; set; }
        public string? WebLink { get; set; }
    }

    public class FromDTO
    {
        public EmailAddressDto? EmailAddress { get; set; }
    }
}
