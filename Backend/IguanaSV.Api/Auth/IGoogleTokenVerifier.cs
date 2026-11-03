namespace IguanaSV.Api.Auth;

/// <summary>
/// Verifies a Google Identity Services ID token (the JWT handed back by the
/// embedded "Continuar con Google" button). Implementations MUST validate the
/// signature against Google's published keys, the issuer and the audience (our
/// OAuth client id) and never trust the token's payload without verification.
/// Returns <c>null</c> for any invalid/expired/foreign token.
/// </summary>
public interface IGoogleTokenVerifier
{
    Task<GoogleUserInfo?> VerifyAsync(string idToken, CancellationToken cancellationToken = default);
}
