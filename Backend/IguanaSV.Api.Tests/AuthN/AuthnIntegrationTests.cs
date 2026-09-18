using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;
using Xunit;
using Xunit.Abstractions;

namespace IguanaSV.Api.Tests.AuthN;

/// <summary>
/// Vertical integration slice for the <c>authn-jwt-cookie</c> capability. Every
/// scenario exercises the real pipeline (JwtBearer-from-cookie + CSRF double
/// submit + credentials-aware CORS) over HTTP against an ephemeral Postgres.
/// Cookies are driven explicitly (no browser jar) so the forged / missing /
/// mismatched cases can be constructed independently. Traces: authn-jwt-cookie
/// spec requirements "Auth cookie issuance", "Session rehydration endpoint",
/// "Logout clears the session", "CSRF double-submit contract",
/// "Credentials-aware CORS allowlist".
/// </summary>
[Collection("AuthN")]
public sealed class AuthnIntegrationTests
{
    private readonly AuthApiFactory _factory;
    private readonly ITestOutputHelper _output;

    public AuthnIntegrationTests(AuthApiFixture fixture, ITestOutputHelper output)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: AuthN integration tests skipped (environment).");
        _factory = fixture.Factory;
        _output = output;
        _output.WriteLine("AuthN integration harness ready against an ephemeral Testcontainers Postgres.");
    }

    private HttpClient Client() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false, // drive cookies explicitly
        });

    // ---- Requirement: Auth cookie issuance -------------------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Login_ValidCredentials_SetsHttpOnlyAuthCookieAndReadableCsrfCookie_BodyHasNoToken()
    {
        var email = NewEmail();
        await RegisterAsync(email, "Secret123!");

        var res = await Client().PostAsync("/api/Auth/login",
            Json(new { email, password = "Secret123!" }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var auth = MustCookie(res, AuthConstants.AuthCookieName);
        Assert.True(auth.HttpOnly, "iguana_auth MUST be HttpOnly.");
        Assert.True(
            auth.SameSite is "lax" or "strict",
            $"iguana_auth MUST be SameSite=Lax or stricter (was '{auth.SameSite}').");

        var csrf = MustCookie(res, AuthConstants.CsrfCookieName);
        Assert.False(csrf.HttpOnly, "iguana_csrf MUST be readable by the SPA (not HttpOnly).");
        Assert.False(string.IsNullOrEmpty(csrf.Value), "iguana_csrf must carry a value.");

        // The token is delivered ONLY in the cookie: the body must not contain it.
        var body = await res.Content.ReadAsStringAsync();
        Assert.DoesNotContain(auth.Value, body);
        Assert.DoesNotContain("eyJ", body); // JWT compact form always starts with 'eyJ'
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Register_IssuesTheSameSessionCookies()
    {
        var email = NewEmail();
        var res = await RegisterAsync(email, "Secret123!");

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        var auth = MustCookie(res, AuthConstants.AuthCookieName);
        Assert.True(auth.HttpOnly, "register must set the HttpOnly auth cookie for the new sub.");
        Assert.NotEmpty(MustCookie(res, AuthConstants.CsrfCookieName).Value);

        var body = await res.Content.ReadAsStringAsync();
        Assert.DoesNotContain("eyJ", body);

        // The issued cookie authenticates a subsequent /me for the SAME user.
        var me = await GetWithAuthCookieAsync("/api/Auth/me", auth.Value);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        using var identity = JsonDocument.Parse(await me.Content.ReadAsStringAsync());
        Assert.Equal(email, identity.RootElement.GetProperty("email").GetString());
    }

    // ---- Requirement: Session rehydration endpoint -----------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Me_WithValidCookie_Returns200_WithIdentityAndRole()
    {
        var email = NewEmail();
        var auth = await LoginAndGetAuthCookieAsync(email, "Secret123!");

        var res = await GetWithAuthCookieAsync("/api/Auth/me", auth);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(email, doc.RootElement.GetProperty("email").GetString());
        Assert.Equal("usuario", doc.RootElement.GetProperty("rol").GetString());
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Me_WithoutCookie_Returns401()
    {
        var res = await Client().GetAsync("/api/Auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    // ---- Requirement: Logout clears the session --------------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task Logout_ThenProtectedCall_Returns401()
    {
        var email = NewEmail();
        var (auth, csrf) = await LoginAndGetSessionAsync(email, "Secret123!");

        // logout is a state-changing call: it carries the CSRF header so the
        // middleware lets it through and the handler expires the cookies.
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={auth}; {AuthConstants.CsrfCookieName}={csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, csrf);
        var res = await client.PostAsync("/api/Auth/logout", content: null);

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        var cleared = MustCookie(res, AuthConstants.AuthCookieName);
        Assert.True(cleared.IsCleared,
            $"logout must expire the auth cookie (value='{cleared.Value}', expires='{cleared.Expires}').");

        // With the (now-cleared) cookie gone, the protected endpoint is anonymous.
        var me = await Client().GetAsync("/api/Auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    // ---- Requirement: forged / expired cookie rejected -------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task ForgedAuthCookie_Returns401()
    {
        var res = await GetWithAuthCookieAsync("/api/Auth/me", "not-a-real.jwt.token");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task ExpiredAuthCookie_Returns401()
    {
        var expired = MintToken(
            sub: "1", rol: "usuario",
            notBefore: DateTimeOffset.UtcNow.AddMinutes(-10),
            expires: DateTimeOffset.UtcNow.AddMinutes(-5));

        var res = await GetWithAuthCookieAsync("/api/Auth/me", expired);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    // ---- Requirement: CSRF double-submit contract ------------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task MutationWithAuthCookie_ButNoCsrfHeader_Returns400()
    {
        var email = NewEmail();
        var (auth, _) = await LoginAndGetSessionAsync(email, "Secret123!");

        var client = Client();
        // Valid auth cookie, but the CSRF header is deliberately missing.
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={auth}");
        var res = await client.PostAsync("/api/Auth/logout", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Contains("CSRF", doc.RootElement.GetProperty("mensaje").GetString());
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task MutationWithMismatchedCsrfHeader_Returns400()
    {
        var email = NewEmail();
        var (auth, csrf) = await LoginAndGetSessionAsync(email, "Secret123!");

        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={auth}; {AuthConstants.CsrfCookieName}={csrf}");
        // Header token does not equal the cookie token.
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, csrf + "x");
        var res = await client.PostAsync("/api/Auth/logout", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task MutationWithMatchingCsrfHeader_PassesCsrfGate()
    {
        var email = NewEmail();
        var (auth, csrf) = await LoginAndGetSessionAsync(email, "Secret123!");

        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={auth}; {AuthConstants.CsrfCookieName}={csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, csrf);
        var res = await client.PostAsync("/api/Auth/logout", content: null);

        // 204 (not 400) proves the double-submit check was satisfied.
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    // ---- Requirement: Credentials-aware CORS allowlist -------------------------

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task AllowlistedOrigin_EchoesOriginWithCredentials()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/Categoria");
        request.Headers.TryAddWithoutValidation("Origin", AuthApiFactory.AllowedOrigin);
        var res = await Client().SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(AuthApiFactory.AllowedOrigin, SingleHeader(res, "Access-Control-Allow-Origin"));
        Assert.Equal("true", SingleHeader(res, "Access-Control-Allow-Credentials"));
    }

    [SkippableFact]
    [Trait("Category", "AuthN")]
    public async Task DisallowedOrigin_ReceivesNoCorsAllowHeader()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/Categoria");
        request.Headers.TryAddWithoutValidation("Origin", "http://evil.example");
        var res = await Client().SendAsync(request);

        // The endpoint still answers (CORS is enforced by the browser), but the
        // response MUST NOT advertise a permissive cross-origin allow header.
        Assert.False(
            res.Headers.TryGetValues("Access-Control-Allow-Origin", out _),
            "A non-allowlisted origin must not receive an Access-Control-Allow-Origin header.");
    }

    // ---- helpers ----------------------------------------------------------------

    private static string NewEmail() => $"u{Guid.NewGuid():N}@authn.test".ToLowerInvariant();

    private Task<HttpResponseMessage> RegisterAsync(string email, string password) =>
        Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Ana",
            apellido = "Test",
            email,
            password,
        }));

    private async Task<string> LoginAndGetAuthCookieAsync(string email, string password)
    {
        var (auth, _) = await LoginAndGetSessionAsync(email, password);
        return auth;
    }

    private async Task<(string Auth, string Csrf)> LoginAndGetSessionAsync(string email, string password)
    {
        await RegisterAsync(email, password);
        var res = await Client().PostAsync("/api/Auth/login", Json(new { email, password }));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (MustCookie(res, AuthConstants.AuthCookieName).Value,
                MustCookie(res, AuthConstants.CsrfCookieName).Value);
    }

    private Task<HttpResponseMessage> GetWithAuthCookieAsync(string path, string authCookieValue)
    {
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={authCookieValue}");
        return client.GetAsync(path);
    }

    private string MintToken(string sub, string rol, DateTimeOffset notBefore, DateTimeOffset expires)
    {
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AuthApiFactory.TestJwtKey)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: AuthApiFactory.TestIssuer,
            audience: AuthApiFactory.TestAudience,
            claims: new[] { new Claim(AuthConstants.SubClaim, sub), new Claim(AuthConstants.RolClaim, rol) },
            notBefore: notBefore.UtcDateTime,
            expires: expires.UtcDateTime,
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static StringContent Json(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    private static string SingleHeader(HttpResponseMessage res, string name)
    {
        Assert.True(res.Headers.TryGetValues(name, out var values), $"Missing header '{name}'.");
        return values!.Single();
    }

    private static ParsedCookie MustCookie(HttpResponseMessage res, string name)
    {
        var raws = res.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.ToList()
            : new List<string>();

        foreach (var raw in raws)
        {
            var cookie = ParsedCookie.Parse(raw);
            if (string.Equals(cookie.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return cookie;
            }
        }

        throw new InvalidOperationException(
            $"Response did not set a '{name}' cookie. Set-Cookie headers: {string.Join(" | ", raws)}");
    }
}

/// <summary>
/// Minimal, dependency-free parser for a single <c>Set-Cookie</c> header value,
/// exposing just the attributes the AuthN spec asserts on (HttpOnly, SameSite,
/// expiry). Kept explicit rather than relying on the framework cookie model so
/// the security-relevant flags are checked against the exact wire bytes.
/// </summary>
internal sealed record ParsedCookie(
    string Name,
    string Value,
    bool HttpOnly,
    string? SameSite,
    string? Expires,
    long? MaxAge)
{
    public bool IsCleared =>
        string.IsNullOrEmpty(Value)
        || (MaxAge.HasValue && MaxAge.Value <= 0)
        || (Expires is not null && Expires.Contains("1970", StringComparison.Ordinal));

    public static ParsedCookie Parse(string raw)
    {
        var parts = raw.Split(';');
        var nameValue = parts[0].Split('=', 2);
        var name = nameValue[0].Trim();
        var value = nameValue.Length > 1 ? nameValue[1].Trim() : string.Empty;

        bool httpOnly = false;
        string? sameSite = null;
        string? expires = null;
        long? maxAge = null;

        foreach (var attrRaw in parts.Skip(1))
        {
            var attr = attrRaw.Trim();
            var lower = attr.ToLowerInvariant();
            if (lower == "httponly")
            {
                httpOnly = true;
            }
            else if (lower.StartsWith("samesite="))
            {
                sameSite = attr["samesite=".Length..].Trim().ToLowerInvariant();
            }
            else if (lower.StartsWith("expires="))
            {
                expires = attr["expires=".Length..].Trim();
            }
            else if (lower.StartsWith("max-age="))
            {
                if (long.TryParse(attr["max-age=".Length..].Trim(), out var seconds))
                {
                    maxAge = seconds;
                }
            }
        }

        return new ParsedCookie(name, value, httpOnly, sameSite, expires, maxAge);
    }
}
