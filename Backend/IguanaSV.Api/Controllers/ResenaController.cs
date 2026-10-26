using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResenaController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IEmailNotificationService _notificaciones;
    private readonly IContentTranslationService _translationService;
    private readonly ILogger<ResenaController> _logger;

    public ResenaController(
        IguanasDbContext context,
        IEmailNotificationService notificaciones,
        IContentTranslationService? translationService = null,
        ILogger<ResenaController>? logger = null)
    {
        _context = context;
        _notificaciones = notificaciones;
        _translationService = translationService ?? NoOpContentTranslationService.Instance;
        _logger = logger ?? NullLogger<ResenaController>.Instance;
    }

    // Public: global star average of a normal user (public user profile).
    // Hosts rate guests post-reservation via POST /api/Resena/huesped.
    [HttpGet("usuario/{usuarioId}")]
    public async Task<IActionResult> GetResumenUsuario(int usuarioId)
    {
        var resumen = await _context.Resenas
            .AsNoTracking()
            .Where(r => r.UsuarioDestinoId == usuarioId)
            .GroupBy(r => 1)
            .Select(g => new ResumenResenasDto
            {
                Promedio = Math.Round(g.Average(r => (double)r.Calificacion), 1),
                Total = g.Count(),
            })
            .FirstOrDefaultAsync() ?? new ResumenResenasDto();

        return Ok(resumen);
    }

    // Create: the reservation row is the single source of eligibility. The
    // server re-validates every rule (owner, arrival day reached, confirmed or
    // completed, not yet reviewed) so a crafted body cannot bypass the UI.
    // A non-owner gets 404 (existence of someone else's row is not leaked).
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<object>> PostResena(CrearResenaDto dto)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var reserva = await _context.Reservas
            .Include(r => r.Resena)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p!.Anfitrion)
            .FirstOrDefaultAsync(r => r.Id == dto.ReservaId);

        if (reserva == null || !reserva.UsuarioId.HasValue || reserva.UsuarioId.Value != sub.Value)
        {
            return NotFound();
        }

        // The publication's host cannot review their own listing, even if a legacy
        // self-reservation already exists (the booking gate closes the normal path;
        // this is defense in depth for rows created before that rule).
        if (reserva.Publicacion?.Anfitrion?.UsuarioId == sub.Value)
        {
            return BadRequest(new { mensaje = "No podés reseñar tu propia publicación." });
        }

        if (reserva.Estado != "confirmada" && reserva.Estado != "completada")
        {
            return BadRequest(new { mensaje = "Solo podés reseñar reservas confirmadas o completadas." });
        }

        if (reserva.FechaInicio > DateOnly.FromDateTime(DateTime.Today))
        {
            return BadRequest(new { mensaje = "Podés dejar tu reseña a partir del día de llegada." });
        }

        if (reserva.Resena != null)
        {
            return Conflict(new { mensaje = "Ya dejaste una reseña para esta reserva." });
        }

        var resena = new Resena
        {
            ReservaId = reserva.Id,
            PublicacionId = reserva.PublicacionId,
            UsuarioId = sub.Value,
            Calificacion = dto.Calificacion,
            Comentario = string.IsNullOrWhiteSpace(dto.Comentario) ? null : dto.Comentario.Trim(),
            CreadoEn = DateTime.Now,
        };
        _context.Resenas.Add(resena);

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Lost the race against a concurrent submit for the same reservation
            // (unique resenas.reserva_id); the constraint is the tie-breaker.
            return Conflict(new { mensaje = "Ya dejaste una reseña para esta reserva." });
        }

        await TranslateCommentIfMissingAsync(resena, HttpContext.RequestAborted);

        // Host notification: fire-and-forget-safe (the service never throws).
        var anfitrion = reserva.Publicacion?.Anfitrion;
        if (!string.IsNullOrWhiteSpace(anfitrion?.Email))
        {
            await _notificaciones.ResenaRecibidaAsync(
                anfitrion.Email,
                anfitrion.Nombre,
                reserva.Publicacion?.Titulo ?? "tu publicación",
                resena.Calificacion);
        }

        return Ok(new
        {
            resena.Id,
            resena.Calificacion,
            resena.Comentario,
            Fecha = resena.CreadoEn,
        });
    }

    // Host rates guest (host→guest review) after completed reservation.
    // Only the host who owns the publication can submit; one review per reservation.
    // Time window: host has 14 days after checkout (FechaFin) to rate the guest.
    [HttpPost("huesped")]
    [Authorize]
    public async Task<ActionResult<object>> PostResenaHuesped(CrearResenaHuespedDto dto)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var caller = await _context.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.Id == sub.Value);
        if (caller == null || caller.Rol != "anfitrion")
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { mensaje = "Solo los anfitriones pueden calificar huéspedes." });
        }

        var reserva = await _context.Reservas
            .Include(r => r.Resena)
            .Include(r => r.Publicacion)
                .ThenInclude(p => p!.Anfitrion)
            .Include(r => r.Usuario) // Guest user for email notification
            .FirstOrDefaultAsync(r => r.Id == dto.ReservaId);

        if (reserva == null || reserva.Publicacion == null || reserva.Publicacion.Anfitrion == null)
        {
            return NotFound();
        }

        if (reserva.Publicacion.Anfitrion.UsuarioId != sub.Value)
        {
            return Forbid();
        }

        if (reserva.Estado != "completada")
        {
            return BadRequest(new { mensaje = "Solo podés calificar huéspedes de reservas completadas." });
        }

        var diasDesdeCheckout = (DateTime.Today - reserva.FechaFin.ToDateTime(TimeOnly.MinValue)).Days;
        if (diasDesdeCheckout > 14)
        {
            return BadRequest(new { mensaje = "El plazo para calificar al huésped venció (14 días después del check-out)." });
        }

        if (reserva.Resena != null && reserva.Resena.UsuarioDestinoId.HasValue)
        {
            return Conflict(new { mensaje = "Ya calificaste a este huésped para esta reserva." });
        }

        if (!reserva.UsuarioId.HasValue || reserva.Usuario == null)
        {
            return BadRequest(new { mensaje = "La reserva no tiene un huésped registrado." });
        }

        var resena = new Resena
        {
            ReservaId = reserva.Id,
            PublicacionId = reserva.PublicacionId,
            UsuarioId = sub.Value, // The host writing the review
            UsuarioDestinoId = reserva.UsuarioId.Value, // The guest being reviewed
            Calificacion = dto.Calificacion,
            Comentario = string.IsNullOrWhiteSpace(dto.Comentario) ? null : dto.Comentario.Trim(),
            CreadoEn = DateTime.Now,
        };
        _context.Resenas.Add(resena);

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Conflict(new { mensaje = "Ya calificaste a este huésped para esta reserva." });
        }

        if (!string.IsNullOrWhiteSpace(reserva.Usuario.Email))
        {
            await _notificaciones.CalificacionRecibidaAsync(
                reserva.Usuario.Email,
                reserva.Usuario.Nombre,
                reserva.Publicacion?.Titulo ?? "tu experiencia",
                resena.Calificacion);
        }

        return Ok(new
        {
            resena.Id,
            resena.Calificacion,
            resena.Comentario,
            Fecha = resena.CreadoEn,
        });
    }

    // Public reviews of one publication (comment area on the detail page).
    // Projects only what a stranger may see: never the guest's email.
    [HttpGet("publicacion/{publicacionId}")]
    public async Task<IActionResult> GetResenasPublicacion(
        int publicacionId,
        [FromQuery] string? contentLocale = null)
    {
        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var resumen = await _context.Resenas
            .Where(r => r.PublicacionId == publicacionId)
            .GroupBy(r => 1)
            .Select(g => new ResumenResenasDto
            {
                Promedio = Math.Round(g.Average(r => (double)r.Calificacion), 1),
                Total = g.Count(),
            })
            .FirstOrDefaultAsync() ?? new ResumenResenasDto();

        var resenas = await _context.Resenas
            .AsNoTracking()
            .Where(r => r.PublicacionId == publicacionId)
            .OrderByDescending(r => r.CreadoEn)
            .Select(r => new
            {
                r.Id,
                r.Calificacion,
                Comentario = locale == "en" && r.ComentarioEn != null && r.ComentarioEn.Trim() != ""
                    ? r.ComentarioEn
                    : r.Comentario,
                Fecha = r.CreadoEn,
                Hueped = r.Usuario.Nombre + " " + r.Usuario.Apellido.Substring(0, 1) + ".",
                RespuestaAnfitrion = locale == "en"
                    && r.RespuestaAnfitrionEn != null
                    && r.RespuestaAnfitrionEn.Trim() != ""
                        ? r.RespuestaAnfitrionEn
                        : r.RespuestaAnfitrion,
                r.FechaRespuesta,
            })
            .ToListAsync();

        return Ok(new { resumen.Promedio, resumen.Total, Resenas = resenas });
    }

    // Batch average for the catalog cards: one call covers every listing on
    // screen. Publications without reviews are simply absent from the map and
    // the client treats that as "Aún no tiene reseñas".
    [HttpGet("resumen")]
    public async Task<IActionResult> GetResumen([FromQuery] string? publicaciones)
    {
        if (string.IsNullOrWhiteSpace(publicaciones))
        {
            return Ok(new Dictionary<string, ResumenResenasDto>());
        }

        var ids = publicaciones
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var v) ? v : -1)
            .Where(v => v > 0)
            .Distinct()
            .Take(100)
            .ToList();

        var agrupadas = await _context.Resenas
            .AsNoTracking()
            .Where(r => ids.Contains(r.PublicacionId))
            .GroupBy(r => r.PublicacionId)
            .Select(g => new { g.Key, Promedio = g.Average(r => (double)r.Calificacion), Total = g.Count() })
            .ToListAsync();

        var mapa = agrupadas.ToDictionary(
            x => x.Key,
            x => new ResumenResenasDto { Promedio = Math.Round(x.Promedio, 1), Total = x.Total });

        return Ok(mapa);
    }

    // Public global rating of a host (shown on the public host profile).
    [HttpGet("anfitrion/{anfitrionId}")]
    public async Task<IActionResult> GetResumenAnfitrion(int anfitrionId)
    {
        var resumen = await _context.Resenas
            .AsNoTracking()
            .Where(r => r.Publicacion!.AnfitrionId == anfitrionId)
            .GroupBy(r => 1)
            .Select(g => new ResumenResenasDto
            {
                Promedio = Math.Round(g.Average(r => (double)r.Calificacion), 1),
                Total = g.Count(),
            })
            .FirstOrDefaultAsync() ?? new ResumenResenasDto();

        return Ok(resumen);
    }

    // Host panel inbox: every review received by the caller's publications
    // (an admin sees all of them), plus a per-publication average summary.
    // Owner scoping mirrors GetPublicacionesByAnfitrion (W3b mechanism).
    [HttpGet("mias")]
    [Authorize]
    public async Task<IActionResult> GetMisResenas([FromQuery] string? contentLocale = null)
    {
        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        IQueryable<Resena> query = _context.Resenas.AsNoTracking();
        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            query = query.Where(r => r.Publicacion!.Anfitrion!.UsuarioId == sub.Value);
        }

        var resumenes = await query
            .GroupBy(r => new
            {
                r.PublicacionId,
                Titulo = locale == "en"
                    && r.Publicacion!.TituloEn != null
                    && r.Publicacion.TituloEn.Trim() != ""
                        ? r.Publicacion.TituloEn
                        : r.Publicacion!.Titulo,
            })
            .Select(g => new
            {
                g.Key.PublicacionId,
                g.Key.Titulo,
                Promedio = Math.Round(g.Average(r => (double)r.Calificacion), 1),
                Total = g.Count(),
            })
            .OrderByDescending(x => x.Total)
            .ToListAsync();

        var resenas = await query
            .OrderByDescending(r => r.CreadoEn)
            .Select(r => new
            {
                r.Id,
                r.Calificacion,
                Comentario = locale == "en" && r.ComentarioEn != null && r.ComentarioEn.Trim() != ""
                    ? r.ComentarioEn
                    : r.Comentario,
                Fecha = r.CreadoEn,
                RespuestaAnfitrion = locale == "en"
                    && r.RespuestaAnfitrionEn != null
                    && r.RespuestaAnfitrionEn.Trim() != ""
                        ? r.RespuestaAnfitrionEn
                        : r.RespuestaAnfitrion,
                RespuestaAnfitrionFuente = r.RespuestaAnfitrion,
                r.FechaRespuesta,
                Hueped = r.Usuario!.Nombre + " " + r.Usuario.Apellido.Substring(0, 1) + ".",
                Publicacion = new
                {
                    r.Publicacion!.Id,
                    Titulo = locale == "en"
                        && r.Publicacion.TituloEn != null
                        && r.Publicacion.TituloEn.Trim() != ""
                            ? r.Publicacion.TituloEn
                            : r.Publicacion.Titulo,
                },
            })
            .ToListAsync();

        return Ok(new { Resumenes = resumenes, Resenas = resenas });
    }

    // Host reply: single editable reply, visible on the publication's review
    // section. Only the host behind the reviewed publication (or an admin)
    // may write it; an empty body clears the reply.
    [HttpPut("{id}/respuesta")]
    [Authorize]
    public async Task<IActionResult> PutRespuesta(int id, ResponderResenaDto dto)
    {
        var resena = await _context.Resenas
            .Include(r => r.Publicacion)
                .ThenInclude(p => p!.Anfitrion)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (resena == null)
        {
            return NotFound();
        }

        var sub = User.GetSubjectId();
        var esDueno = sub.HasValue && resena.Publicacion?.Anfitrion?.UsuarioId == sub.Value;
        if (!esDueno && !User.IsInRole(AuthConstants.AdminRole))
        {
            return Forbid();
        }

        var respuesta = string.IsNullOrWhiteSpace(dto.Respuesta) ? null : dto.Respuesta.Trim();
        var respuestaCambio = !string.Equals(resena.RespuestaAnfitrion, respuesta, StringComparison.Ordinal);
        resena.RespuestaAnfitrion = respuesta;
        if (respuestaCambio) resena.RespuestaAnfitrionEn = null;
        resena.FechaRespuesta = respuesta == null ? null : DateTime.Now;
        resena.ActualizadoEn = DateTime.Now;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        await TranslateReplyIfMissingAsync(resena, HttpContext.RequestAborted);

        return Ok(new { resena.RespuestaAnfitrion, resena.FechaRespuesta });
    }

    private async Task TranslateCommentIfMissingAsync(Resena resena, CancellationToken cancellationToken)
    {
        var source = resena.Comentario;
        if (string.IsNullOrWhiteSpace(source) || source.Length > 1200 || resena.ComentarioEn is not null)
        {
            return;
        }

        try
        {
            var translated = await _translationService.TranslateBatchAsync(
                resena.Id,
                "review_comment",
                [source],
                cancellationToken);
            if (translated is not { Count: 1 }) return;

            await _context.Resenas
                .Where(review => review.Id == resena.Id && review.Comentario == source && review.ComentarioEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(review => review.ComentarioEn, translated[0]), cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            LogTranslationPersistenceFailure(resena.Id, "review_comment", exception);
        }
    }

    private async Task TranslateReplyIfMissingAsync(Resena resena, CancellationToken cancellationToken)
    {
        var source = resena.RespuestaAnfitrion;
        if (string.IsNullOrWhiteSpace(source) || source.Length > 1200 || resena.RespuestaAnfitrionEn is not null)
        {
            return;
        }

        try
        {
            var translated = await _translationService.TranslateBatchAsync(
                resena.Id,
                "review_reply",
                [source],
                cancellationToken);
            if (translated is not { Count: 1 }) return;

            await _context.Resenas
                .Where(review => review.Id == resena.Id
                    && review.RespuestaAnfitrion == source
                    && review.RespuestaAnfitrionEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(review => review.RespuestaAnfitrionEn, translated[0]), cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            LogTranslationPersistenceFailure(resena.Id, "review_reply", exception);
        }
    }

    private void LogTranslationPersistenceFailure(int reviewId, string contentType, Exception exception) =>
        _logger.LogWarning(
            "Review translation persistence failed for {ContentType} on review {ReviewId}: {FailureCategory}",
            contentType,
            reviewId,
            $"persistence_error_{exception.GetType().Name}");

}
