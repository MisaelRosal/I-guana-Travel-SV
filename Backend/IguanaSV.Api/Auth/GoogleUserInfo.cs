namespace IguanaSV.Api.Auth;

/// <summary>
/// Identity claims extracted from a verified Google ID token. Only the fields
/// the app needs for sign-in: the stable subject, the (Google-verified) email
/// and the profile names used to seed a brand-new account.
/// </summary>
public sealed record GoogleUserInfo(
    string Subject,
    string Email,
    bool EmailVerified,
    string? GivenName,
    string? FamilyName,
    string? Name,
    string? Picture);
