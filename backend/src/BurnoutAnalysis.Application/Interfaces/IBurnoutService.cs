using BurnoutAnalysis.Application.DTOs;

namespace BurnoutAnalysis.Application.Interfaces;

public interface IBurnoutService
{
    Task<BurnoutLogResponse> ProcessLogAsync(int userId, BurnoutLogRequest request, CancellationToken ct = default);
    Task<DashboardData> GetDashboardDataAsync(int userId, CancellationToken ct = default);
    Task<List<TrainingRecord>> GetTrainingRecordsAsync(int n, CancellationToken ct = default);
}
