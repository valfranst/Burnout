using Microsoft.AspNetCore.Identity;

namespace BurnoutAnalysis.Domain.Entities;

public class ApplicationUser : IdentityUser<int>
{
    public string? Name { get; set; }
    public string? PictureUrl { get; set; }
    public string? GoogleId { get; set; }
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLogin { get; set; }

    public ICollection<BurnoutLog> BurnoutLogs { get; set; } = [];
    public ICollection<BurnoutRecord> BurnoutRecords { get; set; } = [];
}
