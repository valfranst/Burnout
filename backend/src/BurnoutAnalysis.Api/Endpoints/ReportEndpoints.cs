using BurnoutAnalysis.Application.Interfaces;

namespace BurnoutAnalysis.Api.Endpoints;

public static class ReportEndpoints
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/report")
            .WithTags("Report")
            .RequireRateLimiting("api");

        group.MapGet("/", async (IPublicReportService reportService, HttpContext ctx) =>
        {
            try
            {
                var data = await reportService.GetPublicReportAsync();
                ctx.Response.Headers["Cache-Control"] = "public, max-age=60";
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    title: "Erro interno ao gerar o relatório.",
                    detail: ex.Message,
                    statusCode: 500);
            }
        })
        .WithName("GetPublicReport")
        .AllowAnonymous();

        return app;
    }
}
