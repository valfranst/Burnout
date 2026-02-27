namespace BurnoutAnalysis.Domain.Entities;

/// <summary>
/// Processed burnout analysis result linked to a BurnoutLog.
/// </summary>
public class BurnoutRecord
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public int? LogId { get; set; }
    public BurnoutLog? Log { get; set; }

    // Input features
    public string DayType { get; set; } = "Weekday";
    public float WorkHours { get; set; }
    public float ScreenTimeHours { get; set; }
    public short MeetingsCount { get; set; }
    public short BreaksTaken { get; set; }
    public bool AfterHoursWork { get; set; }
    public int AppSwitches { get; set; }
    public float SleepHours { get; set; }
    public float TaskCompletion { get; set; }
    public short IsolationIndex { get; set; }
    public float FatigueScore { get; set; }

    // AI analysis output
    public float BurnoutScore { get; set; }
    public string BurnoutRisk { get; set; } = "Low";
    public string? Archetype { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
