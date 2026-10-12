using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace IguanaSV.Api.Tests.AuthN;

/// <summary>
/// Launches the real <c>Program.cs</c> pipeline via
/// <see cref="WebApplicationFactory{TEntryPoint}"/>. Configuration that the app
/// reads at startup (JWT key, connection string, CORS allowlist) is supplied
/// through process environment variables set by <see cref="AuthApiFixture"/>
/// BEFORE the host is built — environment variables are part of the app's own
/// default configuration sources and are appended last, so they win over the
/// placeholder values committed in <c>appsettings.json</c>.
/// </summary>
public sealed class AuthApiFactory : WebApplicationFactory<Program>
{
    // Throwaway test secrets, used both when minting tokens (login/register) and
    // when the tests hand-craft forged/expired cookies.
    public const string TestJwtKey = "integration-test-signing-key-not-a-real-secret-0123456789abcdef";
    public const string TestIssuer = "iguana-sv-api";
    public const string TestAudience = "iguana-sv-spa";
    // Origin present in the allowlist for the positive CORS case.
    public const string AllowedOrigin = "http://localhost:5173";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Ensure the JWT bearer runs without HTTPS metadata enforcement and the
        // dev-only Swagger middleware is harmless; all secrets come from env vars.
        builder.UseEnvironment("Development");
    }
}

/// <summary>
/// Collection fixture backing <see cref="AuthnIntegrationTests"/>. Boots an
/// ephemeral <c>postgres:16-alpine</c> Testcontainer (never the host database),
/// runs the real EF migrations against it, exports the startup configuration as
/// environment variables, and hands out a shared <see cref="AuthApiFactory"/>.
/// Degrades to <see cref="DockerAvailable"/> = false when no Docker daemon is
/// present so the suite skips instead of failing.
/// </summary>
public sealed class AuthApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer? _postgres;

    public AuthApiFixture()
    {
        if (Probe.DockerAvailable())
        {
            _postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        }
    }

    public bool DockerAvailable => _postgres is not null;

    /// <summary>
    /// Connection string of the ephemeral database. Exposed so later vertical
    /// slices (W3b+) can seed rows and assert DB state directly through
    /// <c>IguanasDbContext</c>, without weakening the HTTP-side fixtures.
    /// </summary>
    public string? ConnectionString { get; private set; }

    public AuthApiFactory Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        if (_postgres is null)
        {
            return;
        }

        await _postgres.StartAsync();
        var connectionString = _postgres.GetConnectionString();
        ConnectionString = connectionString;

        // Bring the container to the current schema with the shipped migrations.
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new IguanasDbContext(options);
        await db.Database.MigrateAsync();

        // Export the startup configuration. Program.CreateBuilder() reads these
        // when the factory lazily builds the host (on first client creation),
        // which happens strictly after this line.
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", connectionString);
        Environment.SetEnvironmentVariable("Jwt__Key", AuthApiFactory.TestJwtKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", AuthApiFactory.TestIssuer);
        Environment.SetEnvironmentVariable("Jwt__Audience", AuthApiFactory.TestAudience);
        Environment.SetEnvironmentVariable("Jwt__ExpiresInMinutes", "60");
        Environment.SetEnvironmentVariable("CORS__ALLOWED_ORIGINS", AuthApiFactory.AllowedOrigin);
        // These suites register and immediately use the returned session, so the
        // email-verification hold is switched off here. The verification flow
        // itself is covered by AuthnVerificationTests with an explicit client.
        Environment.SetEnvironmentVariable("Email__VerificacionHabilitada", "false");

        Factory = new AuthApiFactory();
    }

    public async Task DisposeAsync()
    {
        if (_postgres is not null)
        {
            Factory?.Dispose();
            await _postgres.DisposeAsync();
        }

        await Task.CompletedTask;
    }
}

/// <summary>Collect the AuthN tests into one container-backed fixture.</summary>
[CollectionDefinition("AuthN")]
public sealed class AuthNCollection : ICollectionFixture<AuthApiFixture>;
