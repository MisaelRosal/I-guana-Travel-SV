using HorarioEntity = IguanaSV.Api.Entities.Horario;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HorarioController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public HorarioController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<HorarioEntity>>> GetHorarios()
    {
        return await _context.Horarios
            .Include(h => h.Publicacion)
            .Include(h => h.ReservaHorarios)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<HorarioEntity>> GetHorario(int id)
    {
        var horario = await _context.Horarios
            .Include(h => h.Publicacion)
            .Include(h => h.ReservaHorarios)
            .FirstOrDefaultAsync(h => h.Id == id);

        if (horario == null)
        {
            return NotFound();
        }

        return horario;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutHorario(int id, CreateHorarioDto dto)
    {
        var horario = await _context.Horarios.FindAsync(id);

        if (horario == null)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        horario.PublicacionId = dto.PublicacionId;
        horario.DiaSemana = dto.DiaSemana;
        horario.HoraInicio = dto.HoraInicio;
        horario.HoraFin = dto.HoraFin;
        horario.UpdatedAt = DateTime.UtcNow;

        _context.Entry(horario).State = EntityState.Modified;

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
    public async Task<ActionResult<HorarioEntity>> PostHorario(CreateHorarioDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var horario = new HorarioEntity
        {
            PublicacionId = dto.PublicacionId,
            DiaSemana = dto.DiaSemana,
            HoraInicio = dto.HoraInicio,
            HoraFin = dto.HoraFin,
            Disponible = true,
            CreatedAt = DateTime.UtcNow
        };

        _context.Horarios.Add(horario);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetHorario), new { id = horario.Id }, horario);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteHorario(int id)
    {
        var horario = await _context.Horarios.FindAsync(id);

        if (horario == null)
        {
            return NotFound();
        }

        _context.Horarios.Remove(horario);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
