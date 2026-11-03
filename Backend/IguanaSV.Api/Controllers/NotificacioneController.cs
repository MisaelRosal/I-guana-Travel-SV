using NotificacioneEntity = IguanaSV.Api.Entities.Notificacione;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class NotificacioneController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public NotificacioneController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<ActionResult<IEnumerable<NotificacioneEntity>>> GetNotificaciones()
    {
        return await _context.Notificaciones
            .Include(n => n.Reserva)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<ActionResult<NotificacioneEntity>> GetNotificacione(int id)
    {
        var notificacione = await _context.Notificaciones
            .Include(n => n.Reserva)
            .FirstOrDefaultAsync(n => n.Id == id);

        if (notificacione == null)
        {
            return NotFound();
        }

        return notificacione;
    }

    // User-facing inbox for the SPA bell: the caller's own rows, newest first.
    // Legacy rows without an account (UsuarioId NULL) stay visible when the
    // stored recipient email matches the caller's account email.
    [HttpGet("mias")]
    [Authorize]
    public async Task<IActionResult> GetMias()
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var email = await CallerEmailAsync(sub.Value);

        var query = _context.Notificaciones
            .AsNoTracking()
            .Where(n => n.UsuarioId == sub.Value
                || (n.UsuarioId == null && n.DestinatarioEmail == email));

        var notificaciones = await query
            .OrderByDescending(n => n.CreatedAt)
            .ThenByDescending(n => n.Id)
            .Select(n => new
            {
                id = n.Id,
                tipo = n.Tipo,
                mensaje = n.Mensaje,
                leida = n.Leida,
                reservaId = n.ReservaId,
                creadoEn = n.CreatedAt,
            })
            .Take(50)
            .ToListAsync();

        var sinLeer = await query.CountAsync(n => n.Leida != true);

        return Ok(new { notificaciones, sinLeer });
    }

    // Mark one of the caller's notifications read. A row belonging to someone
    // else answers 404 so its existence is not leaked.
    [HttpPut("{id}/leer")]
    [Authorize]
    public async Task<IActionResult> MarcarLeida(int id)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var email = await CallerEmailAsync(sub.Value);
        var notificacione = await _context.Notificaciones.FirstOrDefaultAsync(n =>
            n.Id == id
            && (n.UsuarioId == sub.Value || (n.UsuarioId == null && n.DestinatarioEmail == email)));

        if (notificacione == null)
        {
            return NotFound();
        }

        notificacione.Leida = true;
        notificacione.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPut("leer-todas")]
    [Authorize]
    public async Task<IActionResult> MarcarLeidasTodas()
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var email = await CallerEmailAsync(sub.Value);
        var marcadas = await _context.Notificaciones
            .Where(n => (n.UsuarioId == sub.Value || (n.UsuarioId == null && n.DestinatarioEmail == email))
                && n.Leida != true)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.Leida, true)
                .SetProperty(n => n.UpdatedAt, DateTime.Now));

        return Ok(new { marcadas });
    }

    [HttpPut("{id}")]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<IActionResult> PutNotificacione(int id, CreateNotificacioneDto dto)
    {
        var notificacione = await _context.Notificaciones.FindAsync(id);

        if (notificacione == null)
        {
            return NotFound();
        }

        if (!await _context.Reservas.AnyAsync(r => r.Id == dto.ReservaId))
        {
            return NotFound($"La reserva con id {dto.ReservaId} no existe.");
        }

        notificacione.ReservaId = dto.ReservaId;
        notificacione.Tipo = dto.Tipo;
        notificacione.Mensaje = dto.Mensaje;
        notificacione.DestinatarioEmail = dto.DestinatarioEmail;
        notificacione.UpdatedAt = DateTime.Now;

        _context.Entry(notificacione).State = EntityState.Modified;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        return NoContent();
    }

    [HttpPost]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<ActionResult<NotificacioneEntity>> PostNotificacione(CreateNotificacioneDto dto)
    {
        if (!await _context.Reservas.AnyAsync(r => r.Id == dto.ReservaId))
        {
            return NotFound($"La reserva con id {dto.ReservaId} no existe.");
        }

        var notificacione = new NotificacioneEntity
        {
            ReservaId = dto.ReservaId,
            Tipo = dto.Tipo,
            Mensaje = dto.Mensaje,
            Leida = false,
            DestinatarioEmail = dto.DestinatarioEmail,
            CreatedAt = DateTime.Now
        };

        _context.Notificaciones.Add(notificacione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetNotificacione), new { id = notificacione.Id }, notificacione);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<IActionResult> DeleteNotificacione(int id)
    {
        var notificacione = await _context.Notificaciones.FindAsync(id);

        if (notificacione == null)
        {
            return NotFound();
        }

        _context.Notificaciones.Remove(notificacione);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<string?> CallerEmailAsync(int usuarioId) =>
        await _context.Usuarios
            .AsNoTracking()
            .Where(u => u.Id == usuarioId)
            .Select(u => u.Email)
            .FirstOrDefaultAsync();
}
