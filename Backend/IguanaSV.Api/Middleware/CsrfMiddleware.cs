using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;

namespace IguanaSV.Api.Middleware;

/// <summary>
/// Double-submit CSRF guard (design TD4). Runs after authentication and before
/// authorization. For a state-changing request from an authenticated caller it
/// requires the <c>X-CSRF-Token</c> header to match the readable
/// <c>iguana_csrf</c> cookie, compared in constant time.
/// Safe methods (GET/HEAD/OPTIONS) and the anonymous bootstrap endpoints
/// (login/register) are exempt: at login there is no session to protect yet.
/// </summary>
public sealed class CsrfMiddleware
{
    private static readonly HashSet<string> SafeMethods =
        new(StringComparer.OrdinalIgnoreCase) { "GET", "HEAD", "OPTIONS" };

    // These paths authenticate a session and set the CSRF cookie; they cannot
    // require a token the client has not received yet, and they are unauthenticated
    // so a cross-site attacker gains nothing by calling them.
    private static readonly string[] ExemptPathFragments = { "/api/auth/login", "/api/auth/register" };

    private readonly RequestDelegate _next;

    public CsrfMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;

        // Skip safe methods, unauthenticated callers, and the login/register
        // bootstrap endpoints (they set the CSRF cookie rather than consume it).
        if (SafeMethods.Contains(request.Method)
            || context.User.Identity?.IsAuthenticated != true
            || IsExemptPath(request.Path.Value))
        {
            await _next(context);
            return;
        }

        var headerToken = request.Headers.TryGetValue(AuthConstants.CsrfHeaderName, out var h)
            ? h.ToString()
            : null;
        var cookieToken = request.Cookies.TryGetValue(AuthConstants.CsrfCookieName, out var c)
            ? c
            : null;

        if (!TokensMatch(headerToken, cookieToken))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";
            var payload = JsonSerializer.Serialize(
                new { mensaje = "CSRF token missing or invalid." },
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            await context.Response.WriteAsync(payload);
            return;
        }

        await _next(context);
    }

    private static bool IsExemptPath(string? path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return false;
        }

        var normalized = path.ToLowerInvariant();
        return ExemptPathFragments.Any(fragment => normalized.Contains(fragment, StringComparison.Ordinal));
    }

    private static bool TokensMatch(string? header, string? cookie)
    {
        if (string.IsNullOrEmpty(header) || string.IsNullOrEmpty(cookie))
        {
            return false;
        }

        var headerBytes = Encoding.UTF8.GetBytes(header);
        var cookieBytes = Encoding.UTF8.GetBytes(cookie);
        if (headerBytes.Length != cookieBytes.Length)
        {
            // Different lengths can never match; bail out without a timing leak
            // that would help an attacker confirm a partial prefix.
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(headerBytes, cookieBytes);
    }
}
