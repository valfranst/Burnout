using BurnoutAnalysis.Application.Interfaces;
using BurnoutAnalysis.Infrastructure.Data;
using BurnoutAnalysis.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BurnoutAnalysis.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        string connectionString)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<IBurnoutService, BurnoutService>();
        services.AddScoped<IPublicReportService, PublicReportService>();
        services.AddMemoryCache();

        return services;
    }
}
