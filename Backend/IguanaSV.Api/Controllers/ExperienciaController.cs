using ExperienciaEntity = IguanaSV.Api.Entities.Experiencia;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExperienciaController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public ExperienciaController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ExperienciaEntity>>> GetExperiencias()
    {
        return await _context.Experiencias
            .Include(e => e.Publicacion)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ExperienciaEntity>> GetExperiencia(int id)
    {
        var experiencia = await _context.Experiencias
            .Include(e => e.Publicacion)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (experiencia == null)
        {
            return NotFound();
        }

        return experiencia;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutExperiencia(int id, CreateExperienciaDto dto)
    {
        var experiencia = await _context.Experiencias.FindAsync(id);

        if (experiencia == null)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        experiencia.PublicacionId = dto.PublicacionId;
        experiencia.Nombre = dto.Nombre;
        experiencia.Descripcion = dto.Descripcion;
        experiencia.DuracionHoras = dto.DuracionHoras;
        experiencia.PrecioAdicional = dto.PrecioAdicional;
        experiencia.UpdatedAt = DateTime.UtcNow;

        _context.Entry(experiencia).State = EntityState.Modified;

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
    public async Task<ActionResult<ExperienciaEntity>> PostExperiencia(CreateExperienciaDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var experiencia = new ExperienciaEntity
        {
            PublicacionId = dto.PublicacionId,
            Nombre = dto.Nombre,
            Descripcion = dto.Descripcion,
            DuracionHoras = dto.DuracionHoras,
            PrecioAdicional = dto.PrecioAdicional,
            CreatedAt = DateTime.UtcNow
        };

        _context.Experiencias.Add(experiencia);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetExperiencia), new { id = experiencia.Id }, experiencia);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteExperiencia(int id)
    {
        var experiencia = await _context.Experiencias.FindAsync(id);

        if (experiencia == null)
        {
            return NotFound();
        }

        _context.Experiencias.Remove(experiencia);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
