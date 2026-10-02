using System.Text;
using FluentValidation;
using FluentValidation.AspNetCore;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Middleware;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddFluentValidationClientsideAdapters();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddControllers(options =>
{
    options.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;
}).AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});
builder.Services.AddDbContext<IguanasDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddSingleton<IMinioStorageService, MinioStorageService>();

// Background worker that auto-cancels short reservations whose one-hour grace
// window lapsed without payment.
builder.Services.AddHostedService<GraceExpirationService>();

// --- AuthN (design TD4): short-lived JWT delivered in an HttpOnly cookie ---
// The real signing key is injected via user-secrets (dev) or the Jwt__Key
// environment variable (deploy); it is NEVER committed to the repository.
var jwtOptions = new JwtOptions
{
    Key = builder.Configuration["Jwt:Key"] ?? string.Empty,
    Issuer = builder.Configuration["Jwt:Issuer"] ?? "iguana-sv-api",
    Audience = builder.Configuration["Jwt:Audience"] ?? "iguana-sv-spa",
    ExpiresInMinutes = builder.Configuration.GetValue("Jwt:ExpiresInMinutes", 60),
};
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<JwtTokenService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ClockSkew = TimeSpan.FromSeconds(30),
            // The token uses custom claim names; map them onto ClaimsPrincipal.
            NameClaimType = AuthConstants.SubClaim,
            RoleClaimType = AuthConstants.RolClaim,
        };

        // Primary source: the HttpOnly auth cookie. An Authorization: Bearer header
        // is still accepted as a fallback for Swagger/dev/tests (design TD4).
        // JwtBearerOptions has no public TokenRetriever setter, so the cookie read
        // is implemented in OnMessageReceived (the canonical, supported hook); this
        // is functionally identical to the design's `TokenRetriever = cookie` sketch.
        // The token carries explicit claim names (sub, rol); .NET's default inbound
        // claim mapping would rewrite "sub" to the NameIdentifier URI, breaking the
        // documented contract (design TD4) and the ownership reads in W3b. Disable it.
        options.MapInboundClaims = false;
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (ctx.Request.Cookies.TryGetValue(AuthConstants.AuthCookieName, out var cookie)
                    && !string.IsNullOrEmpty(cookie))
                {
                    ctx.Token = cookie;
                    return Task.CompletedTask;
                }

                var authHeader = ctx.Request.Headers.Authorization.ToString();
                if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    ctx.Token = authHeader["Bearer ".Length..].Trim();
                }

                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// --- CORS: credentials-aware explicit allowlist (spec: never AllowAnyOrigin + creds) ---
// Dev/preview origins are fixed; production adds its public origin through the
// CORS__ALLOWED_ORIGINS environment variable (comma- or semicolon-separated).
var configuredOrigins = (builder.Configuration["CORS:ALLOWED_ORIGINS"] ?? string.Empty)
    .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var allowedOrigins = new[]
{
    "http://localhost:5173", // Vite dev SPA
    "http://localhost",      // docker-compose preview
    "http://localhost:5000", // unified local API port (TD1)
}.Concat(configuredOrigins).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors("AllowFrontend");

// Order matters: authenticate (populates User) → CSRF gate (needs User) →
// authorize (needs both) → endpoints.
app.UseAuthentication();
app.UseMiddleware<CsrfMiddleware>();
app.UseAuthorization();

app.MapControllers();

app.Run();

// Exposes the entry point to WebApplicationFactory<Program> in the test project
// while keeping top-level statements.
public partial class Program { }
