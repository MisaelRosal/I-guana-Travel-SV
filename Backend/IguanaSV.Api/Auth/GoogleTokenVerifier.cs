using IguanaSV.Api.Services;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace IguanaSV.Api.Auth;

/// <summary>
/// Validates Google ID tokens against Google's OpenID Connect metadata. The
/// signing keys are fetched (and cached, with automatic rotation) from
/// accounts.google.com; the token is accepted only when the signature, the
/// issuer and the audience (our OAuth client id) all check out and it is still
/// within its lifetime. The client id is the SAME Google OAuth client already
/// used for outbound Gmail, so no extra credential is required.
/// </summary>
public sealed class GoogleTokenVerifier : IGoogleTokenVerifier
{
    private const string DiscoveryUrl = "https://accounts.google.com/.well-known/openid-configuration";

    // Google documents both forms of the issuer in the "iss" claim.
    private static readonly string[] Issuers = { "accounts.google.com", "https://accounts.google.com" };

    private readonly EmailOptions _options;
    private readonly ILogger<GoogleTokenVerifier> _logger;
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _configuracion;

    public GoogleTokenVerifier(IOptions<EmailOptions> options, ILogger<GoogleTokenVerifier> logger)
    {
        _options = options.Value;
        _logger = logger;
        _configuracion = new ConfigurationManager<OpenIdConnectConfiguration>(
            DiscoveryUrl,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true });
    }

    public async Task<GoogleUserInfo?> VerifyAsync(string idToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idToken) || string.IsNullOrWhiteSpace(_options.GoogleClientId))
        {
            return null;
        }

        try
        {
            var configuracion = await _configuracion.GetConfigurationAsync(cancellationToken);

            var handler = new JsonWebTokenHandler();
            var resultado = await handler.ValidateTokenAsync(idToken, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = Issuers,
                ValidateAudience = true,
                ValidAudience = _options.GoogleClientId,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKeys = configuracion.SigningKeys,
                ClockSkew = TimeSpan.FromMinutes(2),
            });

            if (!resultado.IsValid)
            {
                return null;
            }

            var claims = resultado.Claims;
            var email = Leer(claims, "email");
            if (string.IsNullOrWhiteSpace(email))
            {
                return null;
            }

            return new GoogleUserInfo(
                Leer(claims, "sub") ?? string.Empty,
                email,
                LeerBool(claims, "email_verified"),
                Leer(claims, "given_name"),
                Leer(claims, "family_name"),
                Leer(claims, "name"));
        }
        catch (Exception ex)
        {
            // Offline/rotated keys/malformed token: reject rather than throw into
            // the controller. The caller maps null to a 401.
            _logger.LogWarning(ex, "No se pudo validar el token de Google.");
            return null;
        }
    }

    private static string? Leer(IDictionary<string, object> claims, string clave)
        => claims.TryGetValue(clave, out var valor) ? valor?.ToString() : null;

    private static bool LeerBool(IDictionary<string, object> claims, string clave)
    {
        if (!claims.TryGetValue(clave, out var valor))
        {
            return false;
        }

        return valor switch
        {
            bool b => b,
            string s => bool.TryParse(s, out var parsed) && parsed,
            _ => false,
        };
    }
}
