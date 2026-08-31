using ReservaEntity = IguanaSV.Api.Entities.Reserva;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
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
    public async Task<ActionResult<IEnumerable<ReservaEntity>>> GetReservas()
    {
        return await _context.Reservas
            .Include(r => r.Publicacion)
            .Include(r => r.ReservaHorarios)
            .Include(r => r.Notificaciones)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ReservaEntity>> GetReserva(int id)
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

    [HttpPut("{id}")]
    public async Task<IActionResult> PutReserva(int id, CreateReservaDto dto)
    {
        var reserva = await _context.Reservas.FindAsync(id);

        if (reserva == null)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        reserva.PublicacionId = dto.PublicacionId;
        reserva.NombreHuesped = dto.NombreHuesped;
        reserva.EmailHuesped = dto.EmailHuesped;
        reserva.TelefonoHuesped = dto.TelefonoHuesped;
        reserva.FechaInicio = dto.FechaInicio;
        reserva.FechaFin = dto.FechaFin;
        reserva.NumeroHuespedes = dto.NumeroHuespedes;
        reserva.PrecioTotal = dto.PrecioTotal;
        reserva.UpdatedAt = DateTime.UtcNow;

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
    public async Task<ActionResult<ReservaEntity>> PostReserva(CreateReservaDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var reserva = new ReservaEntity
        {
            PublicacionId = dto.PublicacionId,
            NombreHuesped = dto.NombreHuesped,
            EmailHuesped = dto.EmailHuesped,
            TelefonoHuesped = dto.TelefonoHuesped,
            FechaInicio = dto.FechaInicio,
            FechaFin = dto.FechaFin,
            NumeroHuespedes = dto.NumeroHuespedes,
            PrecioTotal = dto.PrecioTotal,
            Estado = "pendiente",
            CreatedAt = DateTime.UtcNow
        };

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
