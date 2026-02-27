using BurnoutAnalysis.Application.DTOs;

namespace BurnoutAnalysis.Application.Interfaces;

public interface IPublicReportService
{
    Task<PublicReportData> GetPublicReportAsync(CancellationToken ct = default);
    void InvalidateCache();
}
