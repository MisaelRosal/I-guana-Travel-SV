using System.Net;
using System.Text.Json;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Controllers;

/// <summary>
/// One-time OAuth 2.0 authorization-code flow that provisions the refresh token
/// the Gmail transport needs. The admin opens /api/auth/gmail-connect, approves
/// gmail.send for the account, and Google redirects to /oauth2callback with a
/// code; the code is exchanged here and the refresh token is shown so it can be
/// stored in Email__GoogleRefreshToken. Sending itself is handled by
/// <see cref="GmailEmailService"/> — nothing on this page runs per message.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class GmailAuthController : ControllerBase
{
    private const string AuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private const string GmailSendScope = "https://www.googleapis.com/auth/gmail.send";

    private readonly EmailOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GmailAuthController> _logger;

    public GmailAuthController(
        IOptions<EmailOptions> options,
        IHttpClientFactory httpClientFactory,
        ILogger<GmailAuthController> logger)
    {
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Builds the Google consent URL and returns it as JSON so the admin can open
    /// it in a browser. Also offered as an HTML redirect for convenience.
    /// </summary>
    [HttpGet("gmail-connect")]
    public IActionResult GmailConnect()
    {
        if (string.IsNullOrWhiteSpace(_options.GoogleClientId))
        {
            return BadRequest(new { mensaje = "Email__GoogleClientId no está configurado." });
        }

        var baseUrl = $"{AuthEndpoint}" +
                      $"?client_id={Uri.EscapeDataString(_options.GoogleClientId)}" +
                      $"&redirect_uri={Uri.EscapeDataString(_options.GoogleRedirectUri)}" +
                      "&response_type=code" +
                      $"&scope={Uri.EscapeDataString(GmailSendScope)}" +
                      "&access_type=offline" +
                      "&prompt=consent";

        if (Request.Headers.Accept.ToString().Contains("text/html", StringComparison.OrdinalIgnoreCase))
        {
            return Content(
                $"""
                <!doctype html><html lang="es"><head><meta charset="utf-8">
                <title>Conectar Gmail</title></head><body style="font-family:sans-serif;padding:2rem">
                <h2>Conectar tu cuenta de Gmail</h2>
                <p>Hacé clic para autorizar el envío de correos desde <b>{Uri.EscapeDataString(_options.GoogleClientId)}</b>.</p>
                <p><a href="{baseUrl}" style="display:inline-block;padding:.6rem 1.2rem;background:#4285f4;color:#fff;text-decoration:none;border-radius:4px">Autorizar en Google</a></p>
                <p style="color:#777">Después de autorizar, Google te devolverá a {WebUtility.HtmlEncode(_options.GoogleRedirectUri)}.</p>
                </body></html>
                """,
                "text/html; charset=utf-8");
        }

        return Ok(new { url = baseUrl, redirectUri = _options.GoogleRedirectUri });
    }

    /// <summary>
    /// Callback target registered in Google. Exchange the authorization code for
    /// tokens. The refresh token is shown in a plain HTML page — the admin copies
    /// it into Email__GoogleRefreshToken (the .env GOOGLE_OAUTH_REFRESH_TOKEN) and
    /// restarts the backend; it is never persisted anywhere else or logged.
    /// </summary>
    [HttpGet("/oauth2callback")]
    public async Task<IActionResult> OAuth2Callback(
        [FromQuery] string? code,
        [FromQuery] string? error,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(error))
        {
            return Content(
                $"<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;padding:2rem\">" +
                $"<h2>OAuth falló</h2><p>Google devolvió el error: <code>{Uri.EscapeDataString(error)}</code></p>" +
                "<p>Verificá que la <b>URI de redirección</b> registrada en Google Cloud Console coincida exactamente con " +
                $"<code>{WebUtility.HtmlEncode(_options.GoogleRedirectUri)}</code>.</p></body></html>",
                "text/html; charset=utf-8");
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            return BadRequest(new { mensaje = "Falta el parámetro code en el callback." });
        }

        try
        {
            using var client = _httpClientFactory.CreateClient("gmail");
            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = _options.GoogleClientId,
                ["client_secret"] = _options.GoogleClientSecret,
                ["redirect_uri"] = _options.GoogleRedirectUri,
                ["grant_type"] = "authorization_code",
            });

            using var response = await client.PostAsync(TokenEndpoint, form, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Intercambio de código OAuth falló (HTTP {Status}): {Body}",
                    (int)response.StatusCode, body);
                return Content(
                    $"<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;padding:2rem\">" +
                    $"<h2>Intercambio de código falló</h2><p>HTTP {(int)response.StatusCode}</p><pre>{Uri.EscapeDataString(body)}</pre></body></html>",
                    "text/html; charset=utf-8");
            }

            using var json = JsonDocument.Parse(body);
            if (!json.RootElement.TryGetProperty("refresh_token", out var rt))
            {
                return Content(
                    "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;padding:2rem\">" +
                    "<h2>No se obtuvo refresh token</h2><p>Google no devolvió un refresh_token. Reintentá; si persiste, " +
                    "revisá que la app esté publicada y que la cuenta esté agregada (modo Testing).</p></body></html>",
                    "text/html; charset=utf-8");
            }

            var refreshToken = rt.GetString() ?? "";
            _logger.LogInformation("Refresh token de Gmail obtenido correctamente. Copialo al .env y reiniciá el backend.");

            return Content(
                $"""
                <!doctype html><html lang="es"><head><meta charset="utf-8">
                <title>¡Autorizado!</title></head>
                <body style="font-family:sans-serif;padding:2rem;max-width:720px">
                <h2 style="color:#188038">✓ Autorización exitosa</h2>
                <p>Gmail quedó conectado. Ahora copiá el refresh token de abajo al archivo</p>
                <p><code>GOOGLE_OAUTH_REFRESH_TOKEN</code> en el <code>.env</code> del proyecto y reiniciá el backend
                (<code>docker compose up -d backend</code>).</p>
                <label>Refresh token:</label><br>
                <textarea rows="5" readonly style="width:100%;font-family:monospace;font-size:.85rem" onclick="this.select()">{WebUtility.HtmlEncode(refreshToken)}</textarea>
                <p style="color:#777">Guardalo en un lugar seguro; tiene acceso de envío sobre tu cuenta Gmail.</p>
                </body></html>
                """,
                "text/html; charset=utf-8");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en el callback OAuth de Gmail.");
            return Content(
                "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;padding:2rem\">" +
                "<h2>Error inesperado en el callback</h2><p>Revisá los logs del backend.</p></body></html>",
                "text/html; charset=utf-8");
        }
    }
}