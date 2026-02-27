namespace BurnoutAnalysis.Application.DTOs;

public record RegisterRequest(string Email, string Password, string? Name);

public record LoginRequest(string Email, string Password);

public record AuthResponse(int UserId, string Email, string? Name, string? PictureUrl);

public record BurnoutLogRequest(
    string DayType,
    float WorkHours,
    float ScreenTimeHours,
    short MeetingsCount,
    int AppSwitches,
    bool AfterHoursWork,
    float SleepHours,
    short IsolationIndex,
    float FatigueScore,
    short BreaksTaken,
    float TaskCompletion = 80f,
    string? DataRegistro = null
);

public record BurnoutLogResponse(
    int LogId,
    int BurnoutId,
    float BurnoutScore,
    string BurnoutRisk,
    string? Archetype,
    bool ModelUsed,
    string RegistrationDate
);

public record DashboardSummary(
    int TotalRecords,
    float? AvgBurnoutScore,
    Dictionary<string, int> RiskDistribution,
    string? DominantArchetype
);

public record WeeklyAverage(string Week, float Avg);

public record TemporalTrend(
    List<WeeklyAverage> WeeklyAverages,
    string Trend,
    float Delta
);

public record AnomalyRecord(DateTime CreatedAt, float FatigueScore, float Zscore);

public record InterventionAnalysis(
    float AvgScoreAfterHighBreakDay,
    float AvgScoreAfterLowBreakDay,
    float InterventionEffect,
    bool Effective
);

public record LatestRecord(
    DateTime CreatedAt,
    float? BurnoutScore,
    string? BurnoutRisk,
    string? Archetype,
    float FatigueScore,
    float WorkHours
);

public record SimilarRecord(
    int Id,
    DateTime CreatedAt,
    float BurnoutScore,
    string BurnoutRisk,
    string? Archetype,
    float Distance
);

public record DashboardData(
    AuthResponse User,
    DashboardSummary Summary,
    object? LastRecord,
    List<LatestRecord> LatestRecords,
    TemporalTrend Temporal,
    List<AnomalyRecord> Anomalies,
    InterventionAnalysis? Interventions,
    List<SimilarRecord> SimilarRecords
);

// Report DTOs
public record ReportDayOfWeek(string DayOfWeek, float AvgBurnoutScore, int TotalRecords);
public record ReportRiskDist(string BurnoutRisk, int Total, float Percentage);
public record ReportArchetype(string Archetype, int Total, float Percentage);
public record ReportOverall(
    float? AvgBurnoutScore,
    float? AvgFatigueScore,
    float? AvgWorkHours,
    float? AvgSleepHours,
    float? AvgIsolationIndex,
    int TotalUsers,
    int TotalRecords
);
public record ReportTrend30d(DateOnly DataRegistro, float AvgBurnoutScore, int TotalRecords);

public record PublicReportData(
    List<ReportDayOfWeek> BurnoutByDayOfWeek,
    List<ReportRiskDist> RiskDistribution,
    List<ReportArchetype> ArchetypeDistribution,
    ReportOverall Overall,
    List<ReportTrend30d> Trend30Days
);

// Training DTOs
public record TrainingRequest(int NumRecords);
public record TrainingRecord(
    string DayType,
    float WorkHours,
    float ScreenTimeHours,
    short MeetingsCount,
    int AppSwitches,
    bool AfterHoursWork,
    float SleepHours,
    short IsolationIndex,
    float FatigueScore,
    short BreaksTaken,
    float TaskCompletion,
    float BurnoutScore,
    string BurnoutRisk,
    string? Archetype
);
