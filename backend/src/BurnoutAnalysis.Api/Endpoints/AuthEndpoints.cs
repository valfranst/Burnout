using BurnoutAnalysis.Application.DTOs;
using BurnoutAnalysis.Application.Interfaces;
using BurnoutAnalysis.Domain.Entities;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BurnoutAnalysis.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        // CSRF token endpoint
        app.MapGet("/csrf-token", (IAntiforgery antiforgery, HttpContext ctx) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(ctx);
            return Results.Ok(new { csrfToken = tokens.RequestToken });
        })
        .WithName("GetCsrfToken")
        .AllowAnonymous();

        // Register
        group.MapPost("/register", async (
            [FromBody] RegisterRequest req,
            UserManager<ApplicationUser> userManager) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "E-mail e senha são obrigatórios." });
            if (req.Password.Length < 8)
                return Results.BadRequest(new { error = "A senha deve ter no mínimo 8 caracteres." });
            if (!req.Password.Any(char.IsLetter))
                return Results.BadRequest(new { error = "A senha deve conter pelo menos 1 letra." });
            if (!req.Password.Any(char.IsDigit))
                return Results.BadRequest(new { error = "A senha deve conter pelo menos 1 número." });

            var user = new ApplicationUser
            {
                UserName = req.Email.Trim().ToLowerInvariant(),
                Email = req.Email.Trim().ToLowerInvariant(),
                Name = req.Name,
                EmailVerified = false,
            };

            var result = await userManager.CreateAsync(user, req.Password);
            if (!result.Succeeded)
            {
                if (result.Errors.Any(e => e.Code is "DuplicateUserName" or "DuplicateEmail"))
                    return Results.Conflict(new { error = "E-mail já cadastrado." });
                var msg = result.Errors.FirstOrDefault()?.Description ?? "Erro ao cadastrar.";
                return Results.BadRequest(new { error = msg });
            }

            return Results.Created($"/auth/me", new { user = new { user.Id, user.Email, user.Name } });
        })
        .WithName("Register")
        .AllowAnonymous();

        // Login
        group.MapPost("/login", async (
            [FromBody] LoginRequest req,
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager) =>
        {
            var user = await userManager.FindByEmailAsync(req.Email);
            if (user is null)
                return Results.Unauthorized();

            var result = await signInManager.PasswordSignInAsync(user, req.Password, isPersistent: true, lockoutOnFailure: true);
            if (!result.Succeeded)
                return Results.Unauthorized();

            // Update last login
            user.LastLogin = DateTime.UtcNow;
            await userManager.UpdateAsync(user);

            return Results.Ok(new { message = "Login realizado com sucesso.", userId = user.Id });
        })
        .WithName("Login")
        .AllowAnonymous();

        // Logout
        group.MapPost("/logout", async (SignInManager<ApplicationUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.Ok(new { message = "Logout realizado." });
        })
        .WithName("Logout")
        .RequireAuthorization();

        // Current user
        group.MapGet("/me", async (
            HttpContext ctx,
            UserManager<ApplicationUser> userManager) =>
        {
            var user = await userManager.GetUserAsync(ctx.User);
            if (user is null) return Results.Unauthorized();
            return Results.Ok(new { user.Id, user.Name, user.Email, user.PictureUrl });
        })
        .WithName("GetMe")
        .RequireAuthorization();

        // Google OAuth2 endpoints (registered in Program.cs via middleware)
        group.MapGet("/google", (HttpContext ctx) =>
        {
            return Results.Challenge(
                new Microsoft.AspNetCore.Authentication.AuthenticationProperties
                {
                    RedirectUri = "/auth/google/callback"
                },
                ["Google"]);
        })
        .WithName("GoogleLogin")
        .AllowAnonymous();

        group.MapGet("/google/callback", async (
            HttpContext ctx,
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager) =>
        {
            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null)
                return Results.Redirect("/login?error=google");

            var result = await signInManager.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: true);
            if (result.Succeeded)
                return Results.Redirect("/dashboard");

            // Create new user from Google profile
            var email = info.Principal.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
            if (email is null)
                return Results.Redirect("/login?error=no_email");

            var user = await userManager.FindByEmailAsync(email);
            if (user is null)
            {
                user = new ApplicationUser
                {
                    UserName = email,
                    Email = email,
                    Name = info.Principal.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value,
                    EmailVerified = true,
                    LastLogin = DateTime.UtcNow,
                };
                var createResult = await userManager.CreateAsync(user);
                if (!createResult.Succeeded)
                    return Results.Redirect("/login?error=create_failed");
            }

            await userManager.AddLoginAsync(user, info);
            await signInManager.SignInAsync(user, isPersistent: true);
            return Results.Redirect("/dashboard");
        })
        .WithName("GoogleCallback")
        .AllowAnonymous();

        return app;
    }
}
