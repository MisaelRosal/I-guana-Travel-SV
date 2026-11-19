using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using IguanaSV.Api.Entities;
using Microsoft.IdentityModel.Tokens;

namespace IguanaSV.Api.Auth;

/// <summary>
/// Issues the short-lived, signed access token that <c>AuthController</c> places
/// in the HttpOnly auth cookie. Signing parameters are read from the
/// <c>Jwt:*</c> configuration section (never hard-coded; the real key lives in
/// user-secrets locally and an environment variable in deployment).
/// </summary>
public sealed class JwtTokenService
{
    private readonly JwtOptions _options;

    public JwtTokenService(JwtOptions options) => _options = options;

    /// <summary>
    /// Build a token whose lifetime is <c>Jwt:ExpiresInMinutes</c> and whose
    /// identity is <c>sub</c> = user id plus a <c>rol</c> claim. The token is
    /// returned as a compact string; it is the caller's job to transport it in a
    /// cookie (spec: the token MUST NOT appear in the response body).
    /// </summary>
    public string CreateToken(Usuario usuario)
    {
        if (!_options.IsConfigured)
        {
            throw new InvalidOperationException(
                "JWT signing key is not configured. Set Jwt:Key via 'dotnet user-secrets set Jwt:Key <key>' " +
                "or the Jwt__Key environment variable before authenticating users.");
        }

        var now = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new(AuthConstants.SubClaim, usuario.Id.ToString()),
            new(AuthConstants.RolClaim, usuario.Rol ?? "usuario"),
            // Populate standard JWT registered claims so the compact token carries
            // iss/aud/exp and validation stays symmetric with JwtBearer.
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now,
            expires: now.AddMinutes(_options.ExpiresInMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

/// <summary>
/// Strongly-typed view of the <c>Jwt:*</c> configuration section.
/// </summary>
public sealed class JwtOptions
{
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = "iguana-sv-api";
    public string Audience { get; set; } = "iguana-sv-spa";
    public int ExpiresInMinutes { get; set; } = 60;

    /// <summary>
    /// A placeholder value (the sentinel shipped in appsettings.json) or an empty
    /// string is treated as "not configured" so the app refuses to mint a token
    /// signed with a public, well-known key.
    /// </summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Key) && !Key.StartsWith('<') && !Key.EndsWith('>');
}
