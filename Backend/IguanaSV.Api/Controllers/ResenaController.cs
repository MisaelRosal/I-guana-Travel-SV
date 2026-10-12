using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResenaController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IEmailNotificationService _notificaciones;

    public ResenaController(IguanasDbContext context, IEmailNotificationService notificaciones)
    {
        _context = context;
        _notificaciones = notificaciones;
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

    // Public reviews of one publication (comment area on the detail page).
    // Projects only what a stranger may see: never the guest's email.
    [HttpGet("publicacion/{publicacionId}")]
    public async Task<IActionResult> GetResenasPublicacion(int publicacionId)
    {
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
                r.Comentario,
                Fecha = r.CreadoEn,
                Hueped = r.Usuario.Nombre + " " + r.Usuario.Apellido.Substring(0, 1) + ".",
                r.RespuestaAnfitrion,
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
    public async Task<IActionResult> GetMisResenas()
    {
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
            .GroupBy(r => new { r.PublicacionId, Titulo = r.Publicacion!.Titulo })
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
                r.Comentario,
                Fecha = r.CreadoEn,
                r.RespuestaAnfitrion,
                r.FechaRespuesta,
                Hueped = r.Usuario!.Nombre + " " + r.Usuario.Apellido.Substring(0, 1) + ".",
                Publicacion = new { r.Publicacion!.Id, r.Publicacion.Titulo },
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
        resena.RespuestaAnfitrion = respuesta;
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

        return Ok(new { resena.RespuestaAnfitrion, resena.FechaRespuesta });
    }
}
