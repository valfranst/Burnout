using BurnoutAnalysis.Application.DTOs;
using BurnoutAnalysis.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace BurnoutAnalysis.Api.Endpoints;

public static class TrainingEndpoints
{
    public static IEndpointRouteBuilder MapTrainingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/treinamento")
            .WithTags("Training")
            .RequireRateLimiting("api");

        /// <summary>
        /// Returns N raw records for client-side TensorFlow.js training in the browser.
        /// </summary>
        group.MapPost("/", async (
            [FromBody] TrainingRequest req,
            IBurnoutService burnoutService) =>
        {
            if (req.NumRecords < 1 || req.NumRecords > 1000)
                return Results.BadRequest(new { error = "Quantidade de registros deve ser um inteiro entre 1 e 1000." });

            try
            {
                var records = await burnoutService.GetTrainingRecordsAsync(req.NumRecords);
                return Results.Ok(new { records });
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    title: "Erro interno ao buscar registros.",
                    detail: ex.Message,
                    statusCode: 500);
            }
        })
        .WithName("GetTrainingRecords")
        .AllowAnonymous();

        return app;
    }
}
