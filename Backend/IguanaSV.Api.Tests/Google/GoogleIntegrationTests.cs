using System.Net;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace IguanaSV.Api.Tests.Google;

/// <summary>
/// Vertical integration slice for "Sign in with Google". Drives
/// POST /api/auth/google and GET /api/auth/google-config through the real
/// pipeline against the shared "AuthN" Testcontainers Postgres. The Google ID
/// token is verified by <see cref="IGoogleTokenVerifier"/>, which this suite
/// replaces with a stub so no network call to Google is made; the contract under
/// test is what AuthController does with a (verified) Google identity:
///   * a brand-new email creates an active account (no code), seeds the name
///     from Google, issues the session cookie and emails "cuenta creada";
///   * an existing local account is linked and signed in with the same id;
///   * invalid / unverified / missing tokens are rejected (401/400);
///   * GET google-config exposes the client id used to render the button.
/// </summary>
[Collection("AuthN")]
public sealed class GoogleIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;

    public GoogleIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: Google integration tests skipped (environment).");
        _fixture = fixture;
        GoogleApiFactory.Respuesta = _ => null;
    }

    [SkippableFact]
    [Trait("Category", "Google")]
    public async Task GoogleConfig_DevuelveElClientId()
    {
        var res = await Client().GetAsync("/api/Auth/google-config");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(GoogleApiFactory.TestClientId, doc.RootElement.GetProperty("clientId").GetString());
    }

    [SkippableFact]
    [Trait("Category", "Google")]
    public async Task NuevoUsuario_CreaCuentaVerificada_EmiteSesion_YNotifica()
    {
        var email = NewEmail();
        GoogleApiFactory.Respuesta =
            _ => new GoogleUserInfo("sub-1", email, true, "Ana", "Pérez", "Ana Pérez");

        var res = await Client().PostAsync("/api/Auth/google", Json(new { credential = "tok" }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using (var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync()))
        {
            Assert.Equal(email, doc.RootElement.GetProperty("email").GetString());
            Assert.True(doc.RootElement.GetProperty("emailVerificado").GetBoolean());
        }

        // Same cookie contract as login/register (no code was ever needed).
        var setCookies = res.Headers.TryGetValues("Set-Cookie", out var v) ? v : Enumerable.Empty<string>();
        Assert.Contains(setCookies, c => c.StartsWith(AuthConstants.AuthCookieName, StringComparison.Ordinal));

        await using var db = NewDb();
        var usuario = await db.Usuarios.SingleAsync(u => u.Email == email);
        Assert.True(usuario.EmailVerificado);
        Assert.Equal("Ana", usuario.Nombre);
        Assert.Equal("Pérez", usuario.Apellido);

        // Only a "cuenta creada" notification (audited), never a verification code.
        var notificada = await db.NotificacionesEmail.AnyAsync(
            n => n.Destinatario == email && n.Tipo == "cuenta_creada_google");
        Assert.True(notificada);
    }

    [SkippableFact]
    [Trait("Category", "Google")]
    public async Task UsuarioExistente_IniciaSesion_ConMismoId()
    {
        var email = NewEmail();
        var existente = await RegisterUserAsync(email);
        GoogleApiFactory.Respuesta = _ => new GoogleUserInfo("sub-2", email, true, "X", "Y", "X Y");

        var res = await Client().PostAsync("/api/Auth/google", Json(new { credential = "tok" }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(existente.UserId, doc.RootElement.GetProperty("id").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Google")]
    public async Task TokenInvalido_Devuelve401()
    {
        GoogleApiFactory.Respuesta = _ => null;

        var res = await Client().PostAsync("/api/Auth/google", Json(new { credential = "invalido" }));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Google")]
    public async Task CorreoNoVerificadoPorGoogle_Devuelve401()
    {
        GoogleApiFactory.Respuesta =
            _ => new GoogleUserInfo("sub-3", NewEmail(), false, "A", "B", null);

        var res = await Client().PostAsync("/api/Auth/google", Json(new { credential = "tok" }));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Google")]
    public async Task SinCredencial_Devuelve400()
    {
        var res = await Client().PostAsync("/api/Auth/google", Json(new { credential = "" }));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // ---- helpers -----------------------------------------------------------------

    private HttpClient Client() =>
        GoogleApiFactory.Instance.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

    private async Task<(int UserId, string Email)> RegisterUserAsync(string email)
    {
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Google",
            apellido = "Existente",
            email,
            password = Password,
        }));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return (doc.RootElement.GetProperty("id").GetInt32(), email);
    }

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private static string NewEmail() => $"g{Guid.NewGuid():N}@google.test".ToLowerInvariant();

    private static StringContent Json(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
}

/// <summary>
/// Boots the real pipeline (like <see cref="AuthApiFactory"/>) but (a) injects a
/// fixed Google client id through configuration and (b) swaps the real
/// <see cref="IGoogleTokenVerifier"/> for a stub whose answer each test sets via
/// <see cref="Respuesta"/>. The shared AuthN fixture already exported the
/// connection string / JWT key to the process environment, so this factory
/// reuses the same Testcontainers database.
/// </summary>
public sealed class GoogleApiFactory : WebApplicationFactory<Program>
{
    public const string TestClientId = "test-client.apps.googleusercontent.com";

    public static readonly GoogleApiFactory Instance = new();

    /// <summary>Token -> identity map driving the stub verifier (per test).</summary>
    public static Func<string, GoogleUserInfo?> Respuesta = _ => null;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        // Bypass the MvcTestingAppManifest content root: a repository path
        // containing an apostrophe breaks the embedded MSBuild expression.
        builder.UseContentRoot(TestContentRoot.Resolve());

        builder.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Email:GoogleClientId"] = TestClientId,
            }));

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IGoogleTokenVerifier>();
            services.AddSingleton<IGoogleTokenVerifier>(new StubVerifier());
        });
    }

    private sealed class StubVerifier : IGoogleTokenVerifier
    {
        public Task<GoogleUserInfo?> VerifyAsync(string idToken, CancellationToken cancellationToken = default)
            => Task.FromResult(Respuesta(idToken));
    }
}
