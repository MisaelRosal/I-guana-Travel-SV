using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Services;

/// <summary>
/// Outbound email transport backed by the Gmail API (OAuth 2.0).
///
/// A long-lived refresh token (obtained once through the authorization-code
/// flow; see GmailAuthController) is exchanged for short-lived access tokens,
/// which are cached until the API reports them near expiry. Messages are posted
/// to <c>users/me/messages/send</c> as base64url-encoded RFC 5322 entities, so
/// the sending account must be authorized for the <c>gmail.send</c> scope.
///
/// See <see cref="SendAsync"/> for the never-throw delivery contract.
/// </summary>
public sealed class GmailEmailService : IEmailService
{
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private const string SendEndpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
    private static readonly TimeSpan AccessTokenLeeway = TimeSpan.FromMinutes(1);

    private readonly EmailOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GmailEmailService> _logger;
    private readonly SemaphoreSlim _tokenGate = new(1, 1);

    private string? _cachedAccessToken;
    private DateTimeOffset _accessTokenExpiry = DateTimeOffset.MinValue;

    public GmailEmailService(
        IOptions<EmailOptions> options,
        IHttpClientFactory httpClientFactory,
        ILogger<GmailEmailService> logger)
    {
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Sends an HTML email from the configured Gmail account. Returns false
    /// (never throws) when credentials are missing, the provider rejects the
    /// message, or the network fails, so callers can log and continue.
    /// </summary>
    public async Task<bool> SendAsync(
        string to,
        string subject,
        string html,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.GoogleClientId) ||
            string.IsNullOrWhiteSpace(_options.GoogleClientSecret) ||
            string.IsNullOrWhiteSpace(_options.GoogleRefreshToken))
        {
            _logger.LogWarning(
                "Gmail transport no configurado (faltan credenciales Google en Email__*): correo a {To} no enviado.",
                to);
            return false;
        }

        try
        {
            var accessToken = await GetAccessTokenAsync(cancellationToken);
            if (string.IsNullOrEmpty(accessToken))
            {
                return false;
            }

            var raw = BuildRawMessage(to, subject, html);
            var payload = JsonSerializer.Serialize(new { raw = ToBase64Url(Encoding.UTF8.GetBytes(raw)) });
            using var request = new HttpRequestMessage(HttpMethod.Post, SendEndpoint)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using var client = _httpClientFactory.CreateClient("gmail");
            using var response = await client.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Correo enviado a {To} ({Subject}) vía Gmail API.", to, subject);
                return true;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Gmail API rechazó el envío a {To} (HTTP {Status}): {Body}",
                to, (int)response.StatusCode, body);
            return false;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo inesperado enviando correo a {To}", to);
            return false;
        }
    }

    private async Task<string?> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(_cachedAccessToken) &&
            DateTimeOffset.UtcNow < _accessTokenExpiry)
        {
            return _cachedAccessToken;
        }

        await _tokenGate.WaitAsync(cancellationToken);
        try
        {
            // Re-check after acquiring the gate: another caller may have refreshed.
            if (!string.IsNullOrEmpty(_cachedAccessToken) &&
                DateTimeOffset.UtcNow < _accessTokenExpiry)
            {
                return _cachedAccessToken;
            }

            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _options.GoogleClientId,
                ["client_secret"] = _options.GoogleClientSecret,
                ["refresh_token"] = _options.GoogleRefreshToken,
                ["grant_type"] = "refresh_token",
            });

            using var client = _httpClientFactory.CreateClient("gmail");
            using var response = await client.PostAsync(TokenEndpoint, form, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "No se pudo renovar el access token de Gmail (HTTP {Status}): {Body}",
                    (int)response.StatusCode, body);
                return null;
            }

            using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));
            var root = json.RootElement;
            var token = root.TryGetProperty("access_token", out var t) ? t.GetString() : null;
            var expiresIn = root.TryGetProperty("expires_in", out var e) && e.TryGetInt64(out var ei) ? ei : 3600;

            _cachedAccessToken = token;
            _accessTokenExpiry = DateTimeOffset.UtcNow.AddSeconds(expiresIn).Subtract(AccessTokenLeeway);
            return token;
        }
        finally
        {
            _tokenGate.Release();
        }
    }

    /// <summary>
    /// Builds a minimal RFC 5322 HTML message. Single text/html part, UTF-8,
    /// CRLF line endings, and the subject RFC 2047-encoded so accented characters
    /// (código, verificación…) render correctly instead of mojibake.
    /// </summary>
    private string BuildRawMessage(string to, string subject, string html)
    {
        var sb = new StringBuilder();
        sb.Append("From: ").Append(_options.From).Append("\r\n");
        sb.Append("To: ").Append(to).Append("\r\n");
        sb.Append("Subject: ").Append(EncodeHeader(subject)).Append("\r\n");
        sb.Append("MIME-Version: 1.0\r\n");
        sb.Append("Content-Type: text/html; charset=UTF-8\r\n");
        sb.Append("Content-Transfer-Encoding: 8bit\r\n");
        sb.Append("\r\n");
        sb.Append(html);
        return sb.ToString();
    }

    /// <summary>
    /// RFC 2047 encodes a header value when it contains non-ASCII characters;
    /// otherwise leaves it untouched. Mail headers must be ASCII, so accented
    /// subjects are transmitted as UTF-8 base64 encoded-words.
    /// </summary>
    private static string EncodeHeader(string value)
    {
        return value.All(c => c < 128)
            ? value
            : "=?UTF-8?B?" + Convert.ToBase64String(Encoding.UTF8.GetBytes(value)) + "?=";
    }

    private static string ToBase64Url(byte[] data)
    {
        return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}