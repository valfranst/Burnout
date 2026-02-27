using BurnoutAnalysis.Application.DTOs;
using BurnoutAnalysis.Application.Interfaces;
using BurnoutAnalysis.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace BurnoutAnalysis.Infrastructure.Services;

public class PublicReportService(AppDbContext db, IMemoryCache cache) : IPublicReportService
{
    private const string CacheKey = "public_report";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);

    public async Task<PublicReportData> GetPublicReportAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out PublicReportData? cached) && cached is not null)
            return cached;

        var byDayOfWeek = await db.BurnoutRecords
            .GroupBy(r => new { DayOfWeek = r.CreatedAt.DayOfWeek, DowNum = (int)r.CreatedAt.DayOfWeek })
            .Select(g => new ReportDayOfWeek(
                g.Key.DayOfWeek.ToString(),
                MathF.Round((float)g.Average(r => r.BurnoutScore), 2),
                g.Count()))
            .OrderBy(r => r.DayOfWeek)
            .ToListAsync(ct);

        var totalRecords = await db.BurnoutRecords.CountAsync(ct);
        var riskGroups = await db.BurnoutRecords
            .Where(r => r.BurnoutRisk != null)
            .GroupBy(r => r.BurnoutRisk)
            .Select(g => new { Risk = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var riskDist = riskGroups
            .Select(g => new ReportRiskDist(
                g.Risk,
                g.Count,
                totalRecords > 0 ? MathF.Round(100f * g.Count / totalRecords, 1) : 0f))
            .OrderBy(r => r.BurnoutRisk)
            .ToList();

        var archetypeGroups = await db.BurnoutRecords
            .Where(r => r.Archetype != null)
            .GroupBy(r => r.Archetype!)
            .Select(g => new { Archetype = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var archetypeDist = archetypeGroups
            .Select(g => new ReportArchetype(
                g.Archetype,
                g.Count,
                totalRecords > 0 ? MathF.Round(100f * g.Count / totalRecords, 1) : 0f))
            .OrderByDescending(r => r.Total)
            .ToList();

        var overall = await db.BurnoutRecords
            .GroupBy(_ => 1)
            .Select(g => new ReportOverall(
                (float?)g.Average(r => r.BurnoutScore),
                (float?)g.Average(r => r.FatigueScore),
                (float?)g.Average(r => r.WorkHours),
                (float?)g.Average(r => r.SleepHours),
                (float?)g.Average(r => r.IsolationIndex),
                g.Select(r => r.UserId).Distinct().Count(),
                g.Count()))
            .FirstOrDefaultAsync(ct)
            ?? new ReportOverall(null, null, null, null, null, 0, 0);

        var cutoff = DateTime.UtcNow.AddDays(-30);
        var trend30d = await db.BurnoutRecords
            .Where(r => r.CreatedAt >= cutoff)
            .GroupBy(r => DateOnly.FromDateTime(r.CreatedAt))
            .Select(g => new ReportTrend30d(
                g.Key,
                MathF.Round((float)g.Average(r => r.BurnoutScore), 2),
                g.Count()))
            .OrderBy(r => r.DataRegistro)
            .ToListAsync(ct);

        var payload = new PublicReportData(byDayOfWeek, riskDist, archetypeDist, overall, trend30d);
        cache.Set(CacheKey, payload, CacheTtl);
        return payload;
    }

    public void InvalidateCache() => cache.Remove(CacheKey);
}
