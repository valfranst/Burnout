namespace BurnoutAnalysis.Domain.Entities;

/// <summary>
/// Raw daily behavioral log submitted by the user.
/// </summary>
public class BurnoutLog
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    // Temporal context
    public DateOnly DataRegistro { get; set; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public string DayType { get; set; } = "Weekday";

    // Behavioral metrics (automated)
    public float WorkHours { get; set; }
    public float ScreenTimeHours { get; set; }
    public short MeetingsCount { get; set; }
    public int AppSwitches { get; set; }
    public bool AfterHoursWork { get; set; }

    // Psychological metrics (self-assessed)
    public float SleepHours { get; set; }
    public short IsolationIndex { get; set; }
    public float FatigueScore { get; set; }
    public short BreaksTaken { get; set; }

    public bool IsProcessed { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public BurnoutRecord? BurnoutRecord { get; set; }
}
