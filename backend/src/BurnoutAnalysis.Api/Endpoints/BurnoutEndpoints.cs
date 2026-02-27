using BurnoutAnalysis.Application.DTOs;
using BurnoutAnalysis.Application.Interfaces;
using BurnoutAnalysis.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BurnoutAnalysis.Api.Endpoints;

public static class BurnoutEndpoints
{
    public static IEndpointRouteBuilder MapBurnoutEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/burnout-logs")
            .WithTags("Burnout")
            .RequireAuthorization()
            .RequireRateLimiting("api");

        group.MapPost("/", async (
            [FromBody] BurnoutLogRequest req,
            HttpContext ctx,
            UserManager<ApplicationUser> userManager,
            IBurnoutService burnoutService,
            IPublicReportService reportService) =>
        {
            var user = await userManager.GetUserAsync(ctx.User);
            if (user is null) return Results.Unauthorized();

            try
            {
                var result = await burnoutService.ProcessLogAsync(user.Id, req);
                reportService.InvalidateCache();
                return Results.Created($"/burnout-logs/{result.LogId}", result);
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    title: "Erro interno ao processar o log.",
                    detail: ex.Message,
                    statusCode: 500);
            }
        })
        .WithName("CreateBurnoutLog");

        return app;
    }
}
