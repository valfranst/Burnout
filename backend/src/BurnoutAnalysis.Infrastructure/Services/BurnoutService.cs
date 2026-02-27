using BurnoutAnalysis.Application.DTOs;
using BurnoutAnalysis.Application.Interfaces;
using BurnoutAnalysis.Application.Services;
using BurnoutAnalysis.Domain.Entities;
using BurnoutAnalysis.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BurnoutAnalysis.Infrastructure.Services;

public class BurnoutService(AppDbContext db) : IBurnoutService
{
    public async Task<BurnoutLogResponse> ProcessLogAsync(int userId, BurnoutLogRequest req, CancellationToken ct = default)
    {
        string registrationDate = req.DataRegistro ?? DateTime.UtcNow.ToString("yyyy-MM-dd");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            // 1. Persist raw log
            var log = new BurnoutLog
            {
                UserId = userId,
                DataRegistro = DateOnly.TryParse(registrationDate, out var d) ? d : DateOnly.FromDateTime(DateTime.UtcNow),
                DayType = req.DayType,
                WorkHours = req.WorkHours,
                ScreenTimeHours = req.ScreenTimeHours,
                MeetingsCount = req.MeetingsCount,
                AppSwitches = req.AppSwitches,
                AfterHoursWork = req.AfterHoursWork,
                SleepHours = req.SleepHours,
                IsolationIndex = req.IsolationIndex,
                FatigueScore = req.FatigueScore,
                BreaksTaken = req.BreaksTaken,
                IsProcessed = false,
            };
            db.BurnoutLogs.Add(log);
            await db.SaveChangesAsync(ct);

            // 2. Server-side rule-based analysis (client TF.js provides the model-based score)
            var result = BurnoutAnalysisEngine.Analyze(
                req.DayType, req.WorkHours, req.ScreenTimeHours,
                req.MeetingsCount, req.BreaksTaken, req.AfterHoursWork,
                req.AppSwitches, req.SleepHours, req.IsolationIndex,
                req.TaskCompletion, req.FatigueScore);

            // 3. Persist processed result
            var record = new BurnoutRecord
            {
                UserId = userId,
                LogId = log.Id,
                DayType = req.DayType,
                WorkHours = req.WorkHours,
                ScreenTimeHours = req.ScreenTimeHours,
                MeetingsCount = req.MeetingsCount,
                BreaksTaken = req.BreaksTaken,
                AfterHoursWork = req.AfterHoursWork,
                AppSwitches = req.AppSwitches,
                SleepHours = req.SleepHours,
                TaskCompletion = req.TaskCompletion,
                IsolationIndex = req.IsolationIndex,
                FatigueScore = req.FatigueScore,
                BurnoutScore = result.BurnoutScore,
                BurnoutRisk = result.BurnoutRisk,
                Archetype = result.Archetype,
            };
            db.BurnoutRecords.Add(record);

            // 4. Mark log as processed
            log.IsProcessed = true;

            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);

            return new BurnoutLogResponse(
                LogId: log.Id,
                BurnoutId: record.Id,
                BurnoutScore: result.BurnoutScore,
                BurnoutRisk: result.BurnoutRisk,
                Archetype: result.Archetype,
                ModelUsed: result.ModelUsed,
                RegistrationDate: registrationDate
            );
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            throw;
        }
    }

    public async Task<DashboardData> GetDashboardDataAsync(int userId, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(-90);

        var records = await db.BurnoutRecords
            .Where(r => r.UserId == userId && r.LogId != null && r.CreatedAt >= cutoff)
            .OrderBy(r => r.CreatedAt)
            .Select(r => new
            {
                r.CreatedAt,
                r.BurnoutScore,
                r.BurnoutRisk,
                r.Archetype,
                r.FatigueScore,
                r.BreaksTaken,
                r.WorkHours,
                r.SleepHours,
            })
            .ToListAsync(ct);

        int total = records.Count;
        float? avgScore = total > 0
            ? MathF.Round(records.Average(r => r.BurnoutScore), 2)
            : null;

        var riskDist = new Dictionary<string, int> { ["Low"] = 0, ["Medium"] = 0, ["High"] = 0 };
        foreach (var r in records)
            riskDist[r.BurnoutRisk] = (riskDist.TryGetValue(r.BurnoutRisk, out int v) ? v : 0) + 1;

        string? dominantArchetype = records
            .Where(r => r.Archetype != null)
            .GroupBy(r => r.Archetype)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .FirstOrDefault();

        // Temporal trend (weekly averages)
        var temporal = ComputeTemporalTrend(records.Select(r => (r.CreatedAt, r.BurnoutScore)).ToList());

        // Anomaly detection
        var anomalies = DetectAnomalies(records.Select(r => (r.CreatedAt, r.FatigueScore)).ToList());

        // Intervention analysis
        var interventions = AnalyzeInterventions(
            records.Select(r => (r.CreatedAt, r.BurnoutScore, (int)r.BreaksTaken)).ToList());

        // Latest records with join
        var latestRecords = await db.BurnoutLogs
            .Where(bl => bl.UserId == userId)
            .OrderByDescending(bl => bl.CreatedAt)
            .Select(bl => new LatestRecord(
                bl.CreatedAt,
                bl.BurnoutRecord != null ? bl.BurnoutRecord.BurnoutScore : null,
                bl.BurnoutRecord != null ? bl.BurnoutRecord.BurnoutRisk : null,
                bl.BurnoutRecord != null ? bl.BurnoutRecord.Archetype : null,
                bl.FatigueScore,
                bl.WorkHours))
            .ToListAsync(ct);

        var user = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new AuthResponse(u.Id, u.Email!, u.Name, u.PictureUrl))
            .FirstOrDefaultAsync(ct)
            ?? new AuthResponse(userId, string.Empty, null, null);

        var lastRecord = records.LastOrDefault();

        return new DashboardData(
            User: user,
            Summary: new DashboardSummary(total, avgScore, riskDist, dominantArchetype),
            LastRecord: lastRecord,
            LatestRecords: latestRecords,
            Temporal: temporal,
            Anomalies: anomalies,
            Interventions: interventions,
            SimilarRecords: []
        );
    }

    public async Task<List<TrainingRecord>> GetTrainingRecordsAsync(int n, CancellationToken ct = default)
    {
        // Use EF Core with random ordering (PostgreSQL: RANDOM())
        return await db.BurnoutRecords
            .OrderBy(_ => EF.Functions.Random())
            .Take(n)
            .Select(r => new TrainingRecord(
                r.DayType, r.WorkHours, r.ScreenTimeHours, r.MeetingsCount,
                r.AppSwitches, r.AfterHoursWork, r.SleepHours, r.IsolationIndex,
                r.FatigueScore, r.BreaksTaken, r.TaskCompletion,
                r.BurnoutScore, r.BurnoutRisk, r.Archetype))
            .ToListAsync(ct);
    }

    // -------- Analysis helpers (ported from modelTraining.js) --------

    private static TemporalTrend ComputeTemporalTrend(List<(DateTime CreatedAt, float BurnoutScore)> records)
    {
        if (records.Count == 0)
            return new TemporalTrend([], "stable", 0);

        var sorted = records.OrderBy(r => r.CreatedAt).ToList();
        var weeks = new Dictionary<string, List<float>>();
        foreach (var r in sorted)
        {
            var d = r.CreatedAt;
            var weekStart = d.AddDays(-(int)d.DayOfWeek);
            string key = weekStart.ToString("yyyy-MM-dd");
            if (!weeks.TryGetValue(key, out var list))
                weeks[key] = list = [];
            list.Add(r.BurnoutScore);
        }

        var weeklyAverages = weeks
            .Select(kv => new WeeklyAverage(kv.Key, MathF.Round(kv.Value.Average(), 2)))
            .OrderBy(w => w.Week)
            .ToList();

        int n = weeklyAverages.Count;
        if (n < 2)
            return new TemporalTrend(weeklyAverages, "stable", 0);

        var first = weeklyAverages.Take((int)Math.Ceiling(n / 2.0)).ToList();
        var last  = weeklyAverages.Skip((int)Math.Floor(n / 2.0)).ToList();
        float avgFirst = first.Average(w => w.Avg);
        float avgLast  = last.Average(w => w.Avg);
        float delta = MathF.Round(avgLast - avgFirst, 2);
        string trend = delta > 5 ? "worsening" : delta < -5 ? "improving" : "stable";

        return new TemporalTrend(weeklyAverages, trend, delta);
    }

    private static List<AnomalyRecord> DetectAnomalies(List<(DateTime CreatedAt, float FatigueScore)> records)
    {
        if (records.Count < 3) return [];

        float mean = records.Average(r => r.FatigueScore);
        float std = MathF.Sqrt(records.Average(r => (r.FatigueScore - mean) * (r.FatigueScore - mean)));
        float threshold = mean + 2 * std;

        return records
            .Where(r => r.FatigueScore > threshold)
            .Select(r => new AnomalyRecord(
                r.CreatedAt,
                r.FatigueScore,
                MathF.Round((r.FatigueScore - mean) / std, 2)))
            .ToList();
    }

    private static InterventionAnalysis? AnalyzeInterventions(
        List<(DateTime CreatedAt, float BurnoutScore, int BreaksTaken)> records)
    {
        if (records.Count < 4) return null;

        var sorted = records.OrderBy(r => r.CreatedAt).ToList();
        float avgBreaks = (float)sorted.Average(r => r.BreaksTaken);

        var highBreakDays = sorted
            .Where(r => r.BreaksTaken > avgBreaks)
            .Select(r => r.CreatedAt.ToString("O"))
            .ToHashSet();

        var scoresAfterHigh = new List<float>();
        for (int i = 0; i < sorted.Count - 1; i++)
            if (highBreakDays.Contains(sorted[i].CreatedAt.ToString("O")))
                scoresAfterHigh.Add(sorted[i + 1].BurnoutScore);

        var scoresAfterLow = sorted
            .Where(r => !highBreakDays.Contains(r.CreatedAt.ToString("O")))
            .Select(r => r.BurnoutScore)
            .ToList();

        if (scoresAfterHigh.Count == 0 || scoresAfterLow.Count == 0) return null;

        float avgAfterHigh = scoresAfterHigh.Average();
        float avgAfterLow  = scoresAfterLow.Average();
        float effect = MathF.Round(avgAfterLow - avgAfterHigh, 2);

        return new InterventionAnalysis(
            MathF.Round(avgAfterHigh, 2),
            MathF.Round(avgAfterLow, 2),
            effect,
            avgAfterLow > avgAfterHigh
        );
    }
}
