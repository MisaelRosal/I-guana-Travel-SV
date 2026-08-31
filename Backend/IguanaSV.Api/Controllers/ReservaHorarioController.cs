using ReservaHorarioEntity = IguanaSV.Api.Entities.ReservaHorario;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservaHorarioController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public ReservaHorarioController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ReservaHorarioEntity>>> GetReservaHorarios()
    {
        return await _context.ReservaHorarios
            .Include(rh => rh.Reserva)
            .Include(rh => rh.Horario)
            .ToListAsync();
    }

    [HttpGet("{reservaId}/{horarioId}")]
    public async Task<ActionResult<ReservaHorarioEntity>> GetReservaHorario(int reservaId, int horarioId)
    {
        var reservaHorario = await _context.ReservaHorarios
            .Include(rh => rh.Reserva)
            .Include(rh => rh.Horario)
            .FirstOrDefaultAsync(rh => rh.ReservaId == reservaId && rh.HorarioId == horarioId);

        if (reservaHorario == null)
        {
            return NotFound();
        }

        return reservaHorario;
    }

    [HttpPut("{reservaId}/{horarioId}")]
    public async Task<IActionResult> PutReservaHorario(int reservaId, int horarioId, CreateReservaHorarioDto dto)
    {
        var exists = await _context.ReservaHorarios
            .AnyAsync(rh => rh.ReservaId == reservaId && rh.HorarioId == horarioId);

        if (!exists)
        {
            return NotFound();
        }

        if (reservaId != dto.ReservaId || horarioId != dto.HorarioId)
        {
            return BadRequest("Los IDs del body no coinciden con los de la ruta.");
        }

        return NoContent();
    }

    [HttpPost]
    public async Task<ActionResult<ReservaHorarioEntity>> PostReservaHorario(CreateReservaHorarioDto dto)
    {
        var reservaExists = await _context.Reservas.AnyAsync(r => r.Id == dto.ReservaId);
        if (!reservaExists)
        {
            return NotFound($"La reserva con id {dto.ReservaId} no existe.");
        }

        var horarioExists = await _context.Horarios.AnyAsync(h => h.Id == dto.HorarioId);
        if (!horarioExists)
        {
            return NotFound($"El horario con id {dto.HorarioId} no existe.");
        }

        var alreadyExists = await _context.ReservaHorarios
            .AnyAsync(rh => rh.ReservaId == dto.ReservaId && rh.HorarioId == dto.HorarioId);

        if (alreadyExists)
        {
            return Conflict("Esa relacion reserva-horario ya existe.");
        }

        var reservaHorario = new ReservaHorarioEntity
        {
            ReservaId = dto.ReservaId,
            HorarioId = dto.HorarioId,
            CreatedAt = DateTime.UtcNow
        };

        _context.ReservaHorarios.Add(reservaHorario);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetReservaHorario), new { reservaId = reservaHorario.ReservaId, horarioId = reservaHorario.HorarioId }, reservaHorario);
    }

    [HttpDelete("{reservaId}/{horarioId}")]
    public async Task<IActionResult> DeleteReservaHorario(int reservaId, int horarioId)
    {
        var reservaHorario = await _context.ReservaHorarios
            .FirstOrDefaultAsync(rh => rh.ReservaId == reservaId && rh.HorarioId == horarioId);

        if (reservaHorario == null)
        {
            return NotFound();
        }

        _context.ReservaHorarios.Remove(reservaHorario);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
