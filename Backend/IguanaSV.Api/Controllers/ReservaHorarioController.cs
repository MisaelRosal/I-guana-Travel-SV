using ReservaHorarioEntity = IguanaSV.Api.Entities.ReservaHorario;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Authorization;
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

    [Authorize]
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

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ReservaHorarioEntity>> PostReservaHorario(CreateReservaHorarioDto dto)
    {
        var reserva = await _context.Reservas.FirstOrDefaultAsync(r => r.Id == dto.ReservaId);
        if (reserva is null)
        {
            return NotFound($"La reserva con id {dto.ReservaId} no existe.");
        }

        var horario = await _context.Horarios.FirstOrDefaultAsync(h => h.Id == dto.HorarioId);
        if (horario is null)
        {
            return NotFound($"El horario con id {dto.HorarioId} no existe.");
        }

        var publicacion = await _context.Publicaciones.FirstOrDefaultAsync(p => p.Id == horario.PublicacionId);
        if (publicacion is null)
        {
            return NotFound($"La publicacion del horario con id {dto.HorarioId} no existe.");
        }

        // Experience slot capacity (design TD3): a per-slot guest count cannot be
        // expressed as a DB EXCLUDE, so it is guarded by a per-slot advisory
        // transaction lock. pg_advisory_xact_lock(horario_id) serializes concurrent
        // bookings that target the same slot for the whole transaction (the lock is
        // released automatically at commit/rollback), closing the read-modify-write
        // race an unlocked count would leave open — this is the DB-enforced
        // replacement for the old racy application check on this path.
        await using var tx = await _context.Database.BeginTransactionAsync();

        await _context.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock({0}::bigint)", horario.Id);

        var yaExiste = await _context.ReservaHorarios
            .AnyAsync(rh => rh.ReservaId == dto.ReservaId && rh.HorarioId == dto.HorarioId);

        if (yaExiste)
        {
            await tx.RollbackAsync();
            return Conflict("Esa relacion reserva-horario ya existe.");
        }

        // Guests already committed to this slot by active reservations. NULL estado
        // counts as active (IS DISTINCT FROM 'cancelada'), mirroring the lodging
        // EXCLUDE predicate, so the two guards never disagree.
        var ocupados = (await _context.ReservaHorarios
            .Where(rh => rh.HorarioId == horario.Id
                && (rh.Reserva!.Estado ?? "") != "cancelada")
            .Select(rh => (int?)rh.Reserva!.NumeroHuespedes)
            .SumAsync()) ?? 0;

        if (ocupados + reserva.NumeroHuespedes > publicacion.CapacidadMaxima)
        {
            // Slot full: refuse the link (and therefore the seat demand) with a 409.
            await tx.RollbackAsync();
            return Conflict(new { mensaje = "El cupo de este horario ya no está disponible." });
        }

        var reservaHorario = new ReservaHorarioEntity
        {
            ReservaId = dto.ReservaId,
            HorarioId = dto.HorarioId,
            CreatedAt = DateTime.Now
        };

        _context.ReservaHorarios.Add(reservaHorario);
        await _context.SaveChangesAsync();
        await tx.CommitAsync();

        return CreatedAtAction(nameof(GetReservaHorario), new { reservaId = reservaHorario.ReservaId, horarioId = reservaHorario.HorarioId }, reservaHorario);
    }

    [Authorize]
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
