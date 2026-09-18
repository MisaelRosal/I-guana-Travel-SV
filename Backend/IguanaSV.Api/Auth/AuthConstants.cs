namespace IguanaSV.Api.Auth;

/// <summary>
/// Shared names for the cookie-based JWT session contract (design TD4).
/// Program's <c>TokenRetriever</c>, <c>AuthController</c> and
/// <c>CsrfMiddleware</c> all reference these so the cookie/header names can
/// never drift between the issuing and the validating sides.
/// </summary>
public static class AuthConstants
{
    /// <summary>HttpOnly cookie carrying the signed access token.</summary>
    public const string AuthCookieName = "iguana_auth";

    /// <summary>
    /// Non-HttpOnly (SPA-readable) cookie holding the double-submit CSRF token.
    /// The SPA must echo its value back in <see cref="CsrfHeaderName"/>.
    /// </summary>
    public const string CsrfCookieName = "iguana_csrf";

    /// <summary>Request header the SPA sends with the CSRF token on mutations.</summary>
    public const string CsrfHeaderName = "X-CSRF-Token";

    /// <summary>JWT claim for the user id (mapped to <c>NameClaimType</c>).</summary>
    public const string SubClaim = "sub";

    /// <summary>JWT claim for the user role (mapped to <c>RoleClaimType</c>).</summary>
    public const string RolClaim = "rol";
}
