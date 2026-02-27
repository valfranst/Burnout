using BurnoutAnalysis.Application.Interfaces;
using BurnoutAnalysis.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace BurnoutAnalysis.Api.Endpoints;

public static class DashboardEndpoints
{
    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/dashboard")
            .WithTags("Dashboard")
            .RequireAuthorization()
            .RequireRateLimiting("api");

        group.MapGet("/", async (
            HttpContext ctx,
            UserManager<ApplicationUser> userManager,
            IBurnoutService burnoutService) =>
        {
            var user = await userManager.GetUserAsync(ctx.User);
            if (user is null) return Results.Unauthorized();

            try
            {
                var data = await burnoutService.GetDashboardDataAsync(user.Id);
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    title: "Erro interno ao carregar o dashboard.",
                    detail: ex.Message,
                    statusCode: 500);
            }
        })
        .WithName("GetDashboard");

        return app;
    }
}
