using System.Text;
using FluentValidation;
using FluentValidation.AspNetCore;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Middleware;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Net;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
// System.Net and HttpOverrides both declare an IPNetwork type (the System.Net
// one is the modern replacement); alias the legacy one KnownNetworks expects.
using IPNetwork = Microsoft.AspNetCore.HttpOverrides.IPNetwork;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddFluentValidationClientsideAdapters();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddControllers(options =>
{
    options.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;
    // Validation 400s speak the { mensaje } shape (see the filter's doc).
    options.Filters.Add<ValidationMessageFilter>(-2000);
}).AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});
builder.Services.AddDbContext<IguanasDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddSingleton<IMinioStorageService, MinioStorageService>();

// N3: behind the compose nginx proxy every client shares the proxy's IP, so the
// rate limiter below (partitioned by RemoteIpAddress) would throttle the whole
// site as a single 10/min bucket. ForwardedHeaders middleware rewrites
// RemoteIpAddress from X-Forwarded-For — but ONLY when the last hop is inside
// the trusted networks configured here. A direct client whose IP is not trusted
// has its XFF header ignored, so spoofing cannot bypass the limit.
// Default is false so direct/dev exposure stays honest (no proxy in front);
// the compose deployment enables it with Forwarded__Enabled=true.
var forwardedHeadersEnabled = builder.Configuration.GetValue("Forwarded:Enabled", false);

// NOTE (A5): the integration-test fixture (AuthApiFixture) sets this flag to
// false; every request of a Testcontainers suite shares one remote IP, so the
// 10/min login register partition would starve the suites themselves.
var rateLimitEnabled = builder.Configuration.GetValue("RateLimit:Enabled", true);

// --- Rate limiting (A5): brute-force guard on the credential-heavy endpoints ---
// Fixed window, partitioned per client IP. The policy is applied ONLY where the
// controllers opt in with [EnableRateLimiting("auth")] (login, register and the
// password-reset request). ASP.NET answers 429 on rejection and no other
// endpoint is rate limited.
if (rateLimitEnabled)
{
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.AddPolicy("auth", httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    });
}

// LibreTranslate is optional for direct backend runs. Source publication writes
// remain available while the translator is disabled or unavailable.
builder.Services.Configure<LibreTranslateOptions>(
    builder.Configuration.GetSection(LibreTranslateOptions.SectionName));
builder.Services.AddHttpClient(LibreTranslateTranslationService.HttpClientName, (services, client) =>
{
    var options = services.GetRequiredService<IOptions<LibreTranslateOptions>>().Value;
    var timeoutSeconds = Math.Clamp(options.TimeoutSeconds, 1, 60);
    client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);

    var baseUri = Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out var configuredUri)
        ? configuredUri
        : new Uri("http://localhost:5501/");
    var uriBuilder = new UriBuilder(baseUri);
    uriBuilder.Path = uriBuilder.Path.TrimEnd('/') + "/";
    client.BaseAddress = uriBuilder.Uri;
});
builder.Services.AddSingleton<TranslationConcurrencyLimiter>();
builder.Services.AddSingleton<LibreTranslateTranslationService>();
builder.Services.AddSingleton<IPublicationTranslationService>(services =>
    services.GetRequiredService<LibreTranslateTranslationService>());
builder.Services.AddSingleton<IContentTranslationService>(services =>
    services.GetRequiredService<LibreTranslateTranslationService>());

// --- Email saliente + verificación de correo (design: notificaciones) ---
// Registration is held until the emailed code is entered while
// Email:VerificacionHabilitada is true. The transport (IEmailService) is the
// Gmail API when Email__GoogleClientId/Secret/RefreshToken are set; otherwise
// SendAsync simply reports failure and the verification flow falls back to
// activating the account without blocking the user.
builder.Services.AddHttpClient("gmail");
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
builder.Services.AddTransient<IEmailService, GmailEmailService>();
// Scoped: the audit log and the code table are written through the request DbContext.
builder.Services.AddScoped<IEmailNotificationService, EmailNotificationService>();
// In-site notifications (notificaciones table), written by the event producers.
builder.Services.AddScoped<INotificacionSitioService, NotificacionSitioService>();
builder.Services.AddScoped<VerificationCodeService>();

// Background worker that auto-cancels short reservations whose one-hour grace
// window lapsed without payment.
builder.Services.AddHostedService<GraceExpirationService>();

// Background workers for the review feature: flips finished reservations to
// 'completada', then emails each guest once their arrival day makes the
// reservation reviewable (marked via reservas.resenas_notificadas_en).
builder.Services.AddHostedService<ReservaCompletionService>();
builder.Services.AddHostedService<ResenaAvailabilityService>();

// Background worker that writes the <24h check-in in-site reminder for both
// sides of every confirmed reservation starting tomorrow.
builder.Services.AddHostedService<CheckinRecordatorioService>();

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

// Google Sign-In: verifies the ID token from the embedded button against
// Google's public keys and the SAME OAuth client id used for outbound Gmail.
builder.Services.AddSingleton<IGoogleTokenVerifier, GoogleTokenVerifier>();

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

// N3: must run BEFORE anything reads RemoteIpAddress (rate limiter, auth logs).
if (forwardedHeadersEnabled)
{
    var forwardedOptions = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
    };
    // Restrict trust to the private docker ranges (compose default bridge is
    // 172.16.0.0/12) and loopback (local nginx / direct dev). Anything else
    // presenting X-Forwarded-For is ignored by the middleware.
    // KnownNetworks is typed with Microsoft.AspNetCore.HttpOverrides.IPNetwork
    // (the legacy type in this ASP.NET Core version), not System.Net.IPNetwork.
    forwardedOptions.KnownNetworks.Clear();
    forwardedOptions.KnownProxies.Clear();
    forwardedOptions.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("172.16.0.0"), 12));
    forwardedOptions.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("10.0.0.0"), 8));
    forwardedOptions.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("192.168.0.0"), 16));
    forwardedOptions.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("127.0.0.0"), 8));
    forwardedOptions.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("::1"), 128));
    app.UseForwardedHeaders(forwardedOptions);
}

app.UseCors("AllowFrontend");

// Order matters: authenticate (populates User) → CSRF gate (needs User) →
// authorize (needs both) → endpoints.
app.UseAuthentication();
app.UseMiddleware<CsrfMiddleware>();
app.UseAuthorization();

// A5: after UseAuthorization so the [EnableRateLimiting] endpoint metadata is
// already bound; only opt-in endpoints are limited.
if (rateLimitEnabled)
{
    app.UseRateLimiter();
}

app.MapControllers();

// Docker-compose healthcheck (A8/A9): anonymous, cheap liveness probe so the
// frontend can wait on the API being up instead of proxying transient 502s.
app.MapGet("/health", () => Microsoft.AspNetCore.Http.Results.Ok(new { status = "ok" }));

app.Run();

// Exposes the entry point to WebApplicationFactory<Program> in the test project
// while keeping top-level statements.
public partial class Program { }
