using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace IguanaSV.Api.Tests.AuthN;

/// <summary>
/// Vertical integration slice for the password-reset capability
/// (POST solicitar/reset-password, reenviar-reset-password,
/// restablecer-password) reusing the emailed 6-digit code machinery. Every
/// scenario runs the real pipeline over HTTP against the shared ephemeral
/// Testcontainers Postgres, with <see cref="IEmailService"/> swapped for an
/// in-memory recorder so the plaintext code (which exists ONLY in the
/// outbound email) can be asserted and replayed. Traces: the reset flow must
/// not enumerate accounts, codes must be purpose-scoped
/// (<c>registro</c> vs <c>reset_password</c>), and a successful reset must
/// revoke the old password while issuing no session.
/// </summary>
[Collection("AuthN")]
public sealed class PasswordResetIntegrationTests
{
    private readonly AuthApiFactory _factory;
    private readonly AuthApiFixture _fixture;

    public PasswordResetIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: password-reset integration tests skipped (environment).");
        _factory = fixture.Factory;
        _fixture = fixture;
    }

    // ---- Requirement: the request endpoint never enumerates accounts ----------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task SolicitarReset_KnownAndUnknownAddress_ReturnTheIdenticalGenericMessage()
    {
        var (factory, _) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        var desconocido = await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email = "nadie-existe@reset.test" }));
        Assert.Equal(HttpStatusCode.OK, desconocido.StatusCode);

        var email = NewEmail();
        await RegisterAsync(client, email, "OldPass123!");
        var conocido = await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }));
        Assert.Equal(HttpStatusCode.OK, conocido.StatusCode);

        // Byte-identical bodies: a caller cannot tell which address exists.
        var mensajeDesconocido = await MensajeAsync(desconocido);
        var mensajeConocido = await MensajeAsync(conocido);
        Assert.Equal(mensajeDesconocido, mensajeConocido);
        Assert.Contains("Si existe una cuenta", mensajeConocido, StringComparison.OrdinalIgnoreCase);
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task ReenviarReset_UnknownAddress_ReturnsOkWithTheSameGenericMessage()
    {
        var (factory, _) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        var res = await client.PostAsync("/api/Auth/reenviar-reset-password",
            Json(new { email = "nadie-existe@reset.test" }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("Si existe una cuenta", await MensajeAsync(res), StringComparison.OrdinalIgnoreCase);
    }

    // ---- Requirement: the code comes from the email and changes the password --

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Reset_FullFlow_UsesEmailedCode_RevokesOldPassword_AndStartsNoSession()
    {
        var (factory, correo) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        const string passwordVieja = "OldPass123!";
        const string passwordNueva = "NewPass456!";
        var email = NewEmail();
        await RegisterAsync(client, email, passwordVieja);

        var solicitar = await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }));
        Assert.Equal(HttpStatusCode.OK, solicitar.StatusCode);

        // The plaintext code exists only in the captured outbound email.
        var codigo = correo.ExtraerCodigo();
        Assert.NotNull(codigo);

        var restablecer = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email,
            codigo,
            nuevaPassword = passwordNueva,
        }));
        Assert.Equal(HttpStatusCode.OK, restablecer.StatusCode);

        // The reset must NOT open a session: no auth cookie is issued.
        Assert.False(restablecer.Headers.TryGetValues("Set-Cookie", out var cookies) &&
            cookies.Any(c => c.StartsWith("iguana_auth=", StringComparison.OrdinalIgnoreCase)),
            "restablecer-password must not issue a session cookie.");

        // Old password revoked, new one accepted.
        var loginViejo = await client.PostAsync("/api/Auth/login",
            Json(new { email, password = passwordVieja }));
        Assert.Equal(HttpStatusCode.Unauthorized, loginViejo.StatusCode);

        var loginNuevo = await client.PostAsync("/api/Auth/login",
            Json(new { email, password = passwordNueva }));
        Assert.Equal(HttpStatusCode.OK, loginNuevo.StatusCode);
    }

    // ---- Requirement: wrong or missing input never changes anything -----------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Reset_WrongCode_Returns400_AndKeepsTheCurrentPassword()
    {
        var (factory, _) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        const string password = "OldPass123!";
        var email = NewEmail();
        await RegisterAsync(client, email, password);

        var solicitar = await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }));
        Assert.Equal(HttpStatusCode.OK, solicitar.StatusCode);

        var malo = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email,
            codigo = "000000",
            nuevaPassword = "NuevaClave99!",
        }));
        Assert.Equal(HttpStatusCode.BadRequest, malo.StatusCode);

        // Password untouched: the original still signs in.
        var login = await client.PostAsync("/api/Auth/login", Json(new { email, password }));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Reset_UnknownAddress_WithAnyCode_ReturnsTheGeneric400()
    {
        var (factory, _) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        var res = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email = "nadie-existe@reset.test",
            codigo = "123456",
            nuevaPassword = "NuevaClave99!",
        }));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        // Same wording as "wrong code" for a real account: no probing.
        Assert.Contains("no es válido", await MensajeAsync(res), StringComparison.OrdinalIgnoreCase);
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Reset_MissingFieldsOrShortPassword_Returns400()
    {
        var (factory, _) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        var email = NewEmail();
        await RegisterAsync(client, email, "OldPass123!");

        var sinCodigo = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email,
            codigo = "",
            nuevaPassword = "NuevaClave99!",
        }));
        Assert.Equal(HttpStatusCode.BadRequest, sinCodigo.StatusCode);

        var corta = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email,
            codigo = "123456",
            nuevaPassword = "abc",
        }));
        Assert.Equal(HttpStatusCode.BadRequest, corta.StatusCode);
    }

    // ---- Requirement: codes are purpose-scoped -------------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task ResetCodes_And_VerificationCodes_AreMutuallyUnusable()
    {
        var (factory, correo) = NewHarness();
        using var _f = factory;
        var client = NewClient(factory);

        var email = NewEmail();
        var id = await RegisterAndGetIdAsync(client, email, "OldPass123!");

        // Registration in this suite runs with verification switched off, so
        // flip the account dormant and mint a genuine "registro" challenge
        // directly through the same service the controller uses.
        await using (var db = NewDbContext())
        {
            var usuario = await db.Usuarios.SingleAsync(u => u.Email == email);
            usuario.EmailVerificado = false;
            await db.SaveChangesAsync();
        }

        string codigoRegistro;
        using (var scope = factory.Services.CreateScope())
        {
            var codigos = scope.ServiceProvider.GetRequiredService<VerificationCodeService>();
            codigoRegistro = await codigos.GenerarAsync(id, "registro");
        }

        var solicitar = await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }));
        Assert.Equal(HttpStatusCode.OK, solicitar.StatusCode);
        var codigoReset = correo.ExtraerCodigo();
        Assert.NotNull(codigoReset);
        Assert.NotEqual(codigoRegistro, codigoReset);

        // A registration code must not authorize a password change...
        var registroComoReset = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email,
            codigo = codigoRegistro,
            nuevaPassword = "NuevaClave99!",
        }));
        Assert.Equal(HttpStatusCode.BadRequest, registroComoReset.StatusCode);

        // ...and a reset code must not complete email verification...
        var resetComoRegistro = await client.PostAsync("/api/Auth/verificar-email",
            Json(new { email, codigo = codigoReset }));
        Assert.Equal(HttpStatusCode.BadRequest, resetComoRegistro.StatusCode);

        // ...while each code still works for its own purpose.
        var registroOk = await client.PostAsync("/api/Auth/verificar-email",
            Json(new { email, codigo = codigoRegistro }));
        Assert.Equal(HttpStatusCode.OK, registroOk.StatusCode);

        var resetOk = await client.PostAsync("/api/Auth/restablecer-password", Json(new
        {
            email,
            codigo = codigoReset,
            nuevaPassword = "NuevaClave99!",
        }));
        Assert.Equal(HttpStatusCode.OK, resetOk.StatusCode);

        var login = await client.PostAsync("/api/Auth/login",
            Json(new { email, password = "NuevaClave99!" }));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    // ---- Requirement: hourly quota on reset codes ----------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task SolicitarReset_BeyondTheHourlyQuota_Returns429()
    {
        // The factory override raises the ceiling only for THIS host: two
        // successful requests, the third must be throttled.
        var overrides = new Dictionary<string, string?>
        {
            // In-memory config keys are literal (no env-var separator mapping),
            // so the section path must use ':' exactly as Options binds it.
            ["Email:VerificacionMaxReenviosHora"] = "2",
        };
        var baseFactory = new AuthApiFactory(overrides);
        using var _base = baseFactory;

        var (factory, _) = NewHarness(baseFactory);
        using var _f = factory;
        var client = NewClient(factory);

        var email = NewEmail();
        await RegisterAsync(client, email, "OldPass123!");

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }))).StatusCode);

        var tercera = await client.PostAsync("/api/Auth/solicitar-reset-password",
            Json(new { email }));
        Assert.Equal(HttpStatusCode.TooManyRequests, tercera.StatusCode);

        // The resend endpoint shares the same quota.
        var reenvio = await client.PostAsync("/api/Auth/reenviar-reset-password",
            Json(new { email }));
        Assert.Equal(HttpStatusCode.TooManyRequests, reenvio.StatusCode);
    }

    // ---- helpers ----------------------------------------------------------------

    private (WebApplicationFactory<Program> Factory, EmailCapture Correo) NewHarness(
        AuthApiFactory? baseFactory = null)
    {
        var correo = new EmailCapture();
        var factory = (baseFactory ?? _factory).WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                // The transport is the ONLY seam the notification layer has
                // (IEmailService doc: "exists so the transport can be faked in
                // tests"): swap it for a recorder to read the emailed code.
                services.RemoveAll<IEmailService>();
                services.AddSingleton<IEmailService>(correo);
            });
        });
        return (factory, correo);
    }

    private IguanasDbContext NewDbContext()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options;
        return new IguanasDbContext(options);
    }

    private static HttpClient NewClient(WebApplicationFactory<Program> factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false, // sessions are asserted explicitly, never jarred
        });

    private static Task<HttpResponseMessage> RegisterAsync(HttpClient client, string email, string password) =>
        client.PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Ana",
            apellido = "Reset",
            email,
            password,
        }));

    /// <summary>Registers and returns the new account's id from the response body.</summary>
    private static async Task<int> RegisterAndGetIdAsync(HttpClient client, string email, string password)
    {
        var res = await RegisterAsync(client, email, password);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("id").GetInt32();
    }

    private static string NewEmail() => $"r{Guid.NewGuid():N}@reset.test".ToLowerInvariant();

    private static StringContent Json(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    private static async Task<string> MensajeAsync(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("mensaje").GetString() ?? string.Empty;
    }

    /// <summary>
    /// In-memory stand-in for the SMTP/Gmail transport. Records every outbound
    /// message so tests can read the 6-digit code, which the notification layer
    /// embeds in a monospace paragraph and never stores anywhere else.
    /// </summary>
    private sealed class EmailCapture : IEmailService
    {
        private readonly List<string> _html = new();

        public Task<bool> SendAsync(string to, string subject, string html,
            CancellationToken cancellationToken = default)
        {
            _html.Add(html);
            return Task.FromResult(true);
        }

        /// <summary>The code of the most recent email that carries one.</summary>
        public string? ExtraerCodigo()
        {
            for (var i = _html.Count - 1; i >= 0; i--)
            {
                var match = Regex.Match(_html[i],
                    @"font-size:32px[^>]*>\s*(\d{6})\s*</p>",
                    RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    return match.Groups[1].Value;
                }
            }

            return null;
        }
    }
}
