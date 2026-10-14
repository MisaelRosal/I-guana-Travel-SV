using HorarioEntity = IguanaSV.Api.Entities.Horario;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Authorization;
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

    [Authorize]
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

        // Owner-or-admin gate (spec: "Publication ownership gate"): a non-admin
        // must own both the horario's current publication and the target one.
        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            if (!await CallerOwnsPublicationAsync(horario.PublicacionId)
                || !await CallerOwnsPublicationAsync(dto.PublicacionId))
            {
                return Forbid();
            }
        }

        horario.PublicacionId = dto.PublicacionId;
        horario.DiaSemana = dto.DiaSemana;
        horario.Fecha = dto.Fecha;
        horario.HoraInicio = dto.HoraInicio;
        horario.HoraFin = dto.HoraFin;
        horario.Disponible = dto.Disponible ?? horario.Disponible ?? true;
        horario.Cupos = dto.Cupos;
        horario.UpdatedAt = DateTime.Now;

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

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<HorarioEntity>> PostHorario(CreateHorarioDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        // A non-admin may only schedule under a publication they own.
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsPublicationAsync(dto.PublicacionId))
        {
            return Forbid();
        }

        var horario = new HorarioEntity
        {
            PublicacionId = dto.PublicacionId,
            DiaSemana = dto.DiaSemana,
            Fecha = dto.Fecha,
            HoraInicio = dto.HoraInicio,
            HoraFin = dto.HoraFin,
            Disponible = dto.Disponible ?? true,
            Cupos = dto.Cupos,
            CreatedAt = DateTime.Now
        };

        _context.Horarios.Add(horario);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetHorario), new { id = horario.Id }, horario);
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteHorario(int id)
    {
        var horario = await _context.Horarios.FindAsync(id);

        if (horario == null)
        {
            return NotFound();
        }

        // Owner-or-admin gate (spec: "Publication ownership gate").
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsPublicationAsync(horario.PublicacionId))
        {
            return Forbid();
        }

        _context.Horarios.Remove(horario);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>True when the token subject owns the host behind the given publication.</summary>
    private async Task<bool> CallerOwnsPublicationAsync(int publicacionId)
    {
        var sub = User.GetSubjectId();
        return sub.HasValue
            && await _context.Publicaciones.AnyAsync(p => p.Id == publicacionId && p.Anfitrion!.UsuarioId == sub.Value);
    }
}
