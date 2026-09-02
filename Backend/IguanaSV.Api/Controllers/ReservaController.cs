using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservaController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public ReservaController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Reserva>>> GetReservas()
    {
        return await _context.Reservas
            .Include(r => r.Publicacion)
            .Include(r => r.ReservaHorarios)
            .Include(r => r.Notificaciones)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Reserva>> GetReserva(int id)
    {
        var reserva = await _context.Reservas
            .Include(r => r.Publicacion)
            .Include(r => r.ReservaHorarios)
            .Include(r => r.Notificaciones)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (reserva == null)
        {
            return NotFound();
        }

        return reserva;
    }

    [HttpGet("disponibilidad/{publicacionId}")]
    public async Task<IActionResult> GetDisponibilidad(int publicacionId)
    {
        var reservasOcupadas = await _context.Reservas
            .Where(r => r.PublicacionId == publicacionId
                && r.Estado != "cancelada"
                && r.FechaFin >= DateOnly.FromDateTime(DateTime.Today))
            .Select(r => new { inicio = r.FechaInicio, fin = r.FechaFin })
            .ToListAsync();

        return Ok(reservasOcupadas);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutReserva(int id, Reserva reserva)
    {
        if (id != reserva.Id)
        {
            return BadRequest();
        }

        var exists = await _context.Reservas.AnyAsync(r => r.Id == id);

        if (!exists)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == reserva.PublicacionId))
        {
            return NotFound($"La publicacion con id {reserva.PublicacionId} no existe.");
        }

        if (reserva.FechaFin < reserva.FechaInicio)
        {
            return BadRequest("La fecha de fin debe ser mayor o igual a la fecha de inicio.");
        }

        _context.Entry(reserva).State = EntityState.Modified;

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
    public async Task<ActionResult<Reserva>> PostReserva(Reserva reserva)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == reserva.PublicacionId))
        {
            return NotFound($"La publicacion con id {reserva.PublicacionId} no existe.");
        }

        if (reserva.FechaFin < reserva.FechaInicio)
        {
            return BadRequest("La fecha de fin debe ser mayor o igual a la fecha de inicio.");
        }

        var hayConflicto = await _context.Reservas
            .AnyAsync(r => r.PublicacionId == reserva.PublicacionId
                && r.Estado != "cancelada"
                && r.FechaInicio <= reserva.FechaFin
                && r.FechaFin >= reserva.FechaInicio);

        if (hayConflicto)
        {
            return Conflict(new { mensaje = "Las fechas seleccionadas no están disponibles. Alguien ya reservó en ese rango de fechas." });
        }

        _context.Reservas.Add(reserva);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetReserva), new { id = reserva.Id }, reserva);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteReserva(int id)
    {
        var reserva = await _context.Reservas.FindAsync(id);

        if (reserva == null)
        {
            return NotFound();
        }

        _context.Reservas.Remove(reserva);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}