namespace IguanaSV.Api.Services;

/// <summary>
/// Options for outbound email. Bound from the <c>Email</c> configuration
/// section; in docker those arrive as the <c>Email__From</c> (and, in the
/// future, provider-specific <c>Email__...</c>) environment variables sourced
/// from the gitignored .env.
/// </summary>
public class EmailOptions
{
    /// <summary>
    /// RFC 5322 From header, e.g. <c>IguanaSV &lt;notificaciones@tudominio.com&gt;</c>.
    /// The sending account must be authorized to use this address/doman.
    /// </summary>
    public string From { get; set; } = "IguanaSV <no-reply@iguanatravelapp.de5.net>";

    /// <summary>
    /// When true, registration is held until the emailed 6-digit code is entered.
    /// Turn off to restore immediate registration (useful if email is misconfigured).
    /// </summary>
    public bool VerificacionHabilitada { get; set; } = true;

    /// <summary>How long a verification code stays valid.</summary>
    public int VerificacionExpiraMinutos { get; set; } = 15;

    /// <summary>Cap on verification emails per user per hour (anti-spam / abuse).</summary>
    public int VerificacionMaxReenviosHora { get; set; } = 10;

    /// <summary>
    /// Gmail API OAuth client id (from Google Cloud Console). Empty until the
    /// Gmail transport is configured; the transport stays in its fallback path.
    /// </summary>
    public string GoogleClientId { get; set; } = "";

    /// <summary>Gmail API OAuth client secret. Secret — never commit.</summary>
    public string GoogleClientSecret { get; set; } = "";

    /// <summary>
    /// OAuth refresh token for the sending account. Obtained once through the
    /// authorization-code flow (GET /api/auth/gmail-connect). With it the
    /// backend mints short-lived access tokens on its own. Secret — never commit.
    /// </summary>
    public string GoogleRefreshToken { get; set; } = "";

    /// <summary>
    /// OAuth redirect URI registered in Google Cloud Console. Local dev default
    /// points at the API's own /oauth2callback route; production must be HTTPS.
    /// </summary>
    public string GoogleRedirectUri { get; set; } = "http://localhost:5000/oauth2callback";
}
