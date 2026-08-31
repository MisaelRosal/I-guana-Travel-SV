using NotificacioneEntity = IguanaSV.Api.Entities.Notificacione;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
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
    public async Task<ActionResult<IEnumerable<NotificacioneEntity>>> GetNotificaciones()
    {
        return await _context.Notificaciones
            .Include(n => n.Reserva)
            .ToListAsync();
    }

    [HttpGet("{id}")]
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

    [HttpPut("{id}")]
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
        notificacione.UpdatedAt = DateTime.UtcNow;

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
            CreatedAt = DateTime.UtcNow
        };

        _context.Notificaciones.Add(notificacione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetNotificacione), new { id = notificacione.Id }, notificacione);
    }

    [HttpDelete("{id}")]
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
}
