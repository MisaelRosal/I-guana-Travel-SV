using AmenidadeEntity = IguanaSV.Api.Entities.Amenidade;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AmenidadeController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public AmenidadeController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AmenidadeEntity>>> GetAmenidades()
    {
        return await _context.Amenidades
            .Include(a => a.PublicacionAmenidads)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AmenidadeEntity>> GetAmenidade(int id)
    {
        var amenidade = await _context.Amenidades
            .Include(a => a.PublicacionAmenidads)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (amenidade == null)
        {
            return NotFound();
        }

        return amenidade;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutAmenidade(int id, CreateAmenidadDto dto)
    {
        var amenidade = await _context.Amenidades.FindAsync(id);

        if (amenidade == null)
        {
            return NotFound();
        }

        amenidade.Nombre = dto.Nombre;
        amenidade.Icono = dto.Icono;
        amenidade.UpdatedAt = DateTime.UtcNow;

        _context.Entry(amenidade).State = EntityState.Modified;

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
    public async Task<ActionResult<AmenidadeEntity>> PostAmenidade(CreateAmenidadDto dto)
    {
        var amenidade = new AmenidadeEntity
        {
            Nombre = dto.Nombre,
            Icono = dto.Icono,
            CreatedAt = DateTime.UtcNow
        };

        _context.Amenidades.Add(amenidade);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAmenidade), new { id = amenidade.Id }, amenidade);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAmenidade(int id)
    {
        var amenidade = await _context.Amenidades.FindAsync(id);

        if (amenidade == null)
        {
            return NotFound();
        }

        _context.Amenidades.Remove(amenidade);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
