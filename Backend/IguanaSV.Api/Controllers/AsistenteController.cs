using System.Text;
using System.Text.Json;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Controllers;

/// <summary>
/// Anonymous AI assistant over the public catalog. Answers stream as NDJSON
/// (one JSON object per line) so the user reads the first token instead of
/// waiting for the whole answer; every answer is grounded on the injected
/// catalog and never invented.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public sealed class AsistenteController : ControllerBase
{
    private const string MensajeNoDisponible = "El asistente no está disponible en este momento. Probá de nuevo en unos segundos.";
    private const int MaxHistorial = 8;
    private const int MaxTurnoLength = 1000;

    private static readonly JsonSerializerOptions LineaJson = new(JsonSerializerDefaults.Web);

    private readonly IAsistenteService _asistente;
    private readonly IOptions<AsistenteOptions> _options;
    private readonly ILogger<AsistenteController> _logger;

    public AsistenteController(
        IAsistenteService asistente,
        IOptions<AsistenteOptions> options,
        ILogger<AsistenteController> logger)
    {
        _asistente = asistente;
        _options = options;
        _logger = logger;
    }

    [HttpPost("chat")]
    [EnableRateLimiting("asistente")]
    public async Task<IActionResult> Chat([FromBody] AsistenteChatRequest? request, CancellationToken cancellationToken)
    {
        var mensaje = request?.Mensaje?.Trim();
        if (string.IsNullOrEmpty(mensaje))
        {
            return BadRequest(new { mensaje = "Escribí una consulta para el asistente." });
        }

        if (mensaje.Length > _options.Value.MaxMensajeLength)
        {
            return BadRequest(new { mensaje = $"La consulta no puede superar los {_options.Value.MaxMensajeLength} caracteres." });
        }

        if (!PublicacionContentLocale.TryNormalizeContentLocale(request?.ContentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        if (!_asistente.Habilitado)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { mensaje = MensajeNoDisponible });
        }

        var historial = NormalizarHistorial(request?.Historial);
        var catalogo = await _asistente.CatalogoAsync(locale, cancellationToken);

        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "application/x-ndjson; charset=utf-8";
        Response.Headers.CacheControl = "no-cache";
        // nginx buffers proxied responses by default; this opts the stream out.
        Response.Headers["X-Accel-Buffering"] = "no";

        var acumulado = new StringBuilder();
        try
        {
            await foreach (var delta in _asistente.TransmitirAsync(catalogo, historial, mensaje, locale, cancellationToken))
            {
                acumulado.Append(delta);
                await EscribirLineaAsync(new { delta }, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Client hung up: nothing left to answer.
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Assistant stream failed");
            await EscribirLineaAsync(new { error = MensajeNoDisponible }, cancellationToken);
            return new EmptyResult();
        }

        if (acumulado.Length == 0)
        {
            await EscribirLineaAsync(new { error = MensajeNoDisponible }, cancellationToken);
            return new EmptyResult();
        }

        var publicaciones = AsistentePrompt.BuscarMenciones(acumulado.ToString(), catalogo);
        await EscribirLineaAsync(new { publicaciones, done = true }, cancellationToken);
        return new EmptyResult();
    }

    // The client owns the conversation; the server only whitelists and bounds it
    // so a caller cannot inflate the prompt or smuggle a system turn.
    private static IReadOnlyList<AsistenteTurno> NormalizarHistorial(IReadOnlyList<AsistenteTurno>? historial)
    {
        if (historial is null || historial.Count == 0)
        {
            return Array.Empty<AsistenteTurno>();
        }

        var limpios = new List<AsistenteTurno>(MaxHistorial);
        foreach (var turno in historial.TakeLast(MaxHistorial))
        {
            var texto = turno?.Texto?.Trim();
            if (string.IsNullOrEmpty(texto))
            {
                continue;
            }

            var rol = turno!.Rol == "asistente" ? "asistente" : "usuario";
            limpios.Add(new AsistenteTurno(
                rol,
                texto.Length > MaxTurnoLength ? texto[..MaxTurnoLength] : texto));
        }

        return limpios;
    }

    private async Task EscribirLineaAsync(object evento, CancellationToken cancellationToken)
    {
        await Response.WriteAsync(JsonSerializer.Serialize(evento, LineaJson) + "\n", cancellationToken);
        await Response.Body.FlushAsync(cancellationToken);
    }
}
