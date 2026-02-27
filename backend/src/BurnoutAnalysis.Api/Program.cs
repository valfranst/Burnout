using BurnoutAnalysis.Api.Endpoints;
using BurnoutAnalysis.Domain.Entities;
using BurnoutAnalysis.Infrastructure;
using BurnoutAnalysis.Infrastructure.Data;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// ── Configuration ─────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is missing.");

// ── Infrastructure (EF Core, Services) ────────────────────────────────────────
builder.Services.AddInfrastructure(connectionString);

// ── Identity (local auth) ─────────────────────────────────────────────────────
builder.Services
    .AddIdentity<ApplicationUser, IdentityRole<int>>(options =>
    {
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequiredLength = 8;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

// ── Authentication (Cookie + Google OAuth2) ───────────────────────────────────
var authBuilder = builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    })
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.SlidingExpiration = true;
        options.LoginPath = "/login";
        options.Events.OnRedirectToLogin = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api") ||
                ctx.Request.Headers.Accept.Any(h => h?.Contains("application/json") == true))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            ctx.Response.Redirect(ctx.RedirectUri);
            return Task.CompletedTask;
        };
    });

var googleClientId = builder.Configuration["Authentication:Google:ClientId"];
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
if (!string.IsNullOrEmpty(googleClientId) && !string.IsNullOrEmpty(googleClientSecret))
{
    authBuilder.AddGoogle(options =>
    {
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
        options.CallbackPath = "/auth/google/callback";
        options.Scope.Add("profile");
        options.Scope.Add("email");
    });
}

builder.Services.AddAuthorization();

// ── CSRF (Antiforgery) ────────────────────────────────────────────────────────
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "x-csrf-token";
    options.Cookie.HttpOnly = false;    // Angular needs to read it
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.Cookie.SameSite = SameSiteMode.Strict;
});

// ── Rate Limiting (native .NET) ────────────────────────────────────────────────
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("auth", policy =>
    {
        policy.PermitLimit = 20;
        policy.Window = TimeSpan.FromMinutes(15);
        policy.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        policy.QueueLimit = 0;
    });

    options.AddFixedWindowLimiter("api", policy =>
    {
        policy.PermitLimit = 60;
        policy.Window = TimeSpan.FromMinutes(1);
        policy.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        policy.QueueLimit = 0;
    });

    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { error = "Limite de requisições atingido. Tente novamente em breve." }, token);
    };
});

// ── Compression ───────────────────────────────────────────────────────────────
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

// ── CORS (Angular SPA) ────────────────────────────────────────────────────────
var angularOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:4200"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Angular", policy =>
    {
        policy
            .WithOrigins(angularOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
            // Expose headers Angular needs
            .WithExposedHeaders("X-Cache", "Cache-Control", "X-CSRF-TOKEN");
    });
});

// ── OpenAPI / Scalar ──────────────────────────────────────────────────────────
builder.Services.AddOpenApi();

// ── App ───────────────────────────────────────────────────────────────────────
var app = builder.Build();

app.UseResponseCompression();

// ── Migrate & seed DB on startup ──────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.Title = "Burnout Analysis API";
        options.Theme = ScalarTheme.DeepSpace;
    });
}

app.UseHttpsRedirection();
app.UseStaticFiles();   // wwwroot — serves model.json, weights.bin, context.json

app.UseCors("Angular");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// ── Antiforgery middleware ────────────────────────────────────────────────────
app.Use(async (ctx, next) =>
{
    var antiforgery = ctx.RequestServices.GetRequiredService<IAntiforgery>();
    if (HttpMethods.IsGet(ctx.Request.Method) ||
        HttpMethods.IsHead(ctx.Request.Method) ||
        HttpMethods.IsOptions(ctx.Request.Method))
    {
        // Ensure cookie is set on GET requests
        antiforgery.GetAndStoreTokens(ctx);
        await next(ctx);
        return;
    }

    // Skip CSRF for auth endpoints (handled by cookie auth)
    if (ctx.Request.Path.StartsWithSegments("/auth/google"))
    {
        await next(ctx);
        return;
    }

    // Validate CSRF for unsafe methods on non-GET endpoints
    if (!await antiforgery.IsRequestValidAsync(ctx))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsJsonAsync(new { error = "CSRF token inválido." });
        return;
    }

    await next(ctx);
});

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.MapAuthEndpoints();
app.MapBurnoutEndpoints();
app.MapDashboardEndpoints();
app.MapReportEndpoints();
app.MapTrainingEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }))
    .AllowAnonymous()
    .WithTags("Health");

// Silence Chrome DevTools probe
app.MapGet("/.well-known/appspecific/com.chrome.devtools.json", () => Results.Ok(new { }))
    .AllowAnonymous()
    .ExcludeFromDescription();

app.Run();

// Make Program accessible for integration tests
public partial class Program { }
