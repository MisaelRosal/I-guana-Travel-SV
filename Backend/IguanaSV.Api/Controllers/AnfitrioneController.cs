using AnfitrioneEntity = IguanaSV.Api.Entities.Anfitrione;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnfitrioneController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public AnfitrioneController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AnfitrioneEntity>>> GetAnfitriones()
    {
        return await _context.Anfitriones
            .Include(a => a.Municipio)
            .Include(a => a.Publicaciones)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AnfitrioneEntity>> GetAnfitrione(int id)
    {
        var anfitrione = await _context.Anfitriones
            .Include(a => a.Municipio)
            .Include(a => a.Publicaciones)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (anfitrione == null)
        {
            return NotFound();
        }

        return anfitrione;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutAnfitrione(int id, CreateAnfitrioneDto dto)
    {
        var anfitrione = await _context.Anfitriones.FindAsync(id);

        if (anfitrione == null)
        {
            return NotFound();
        }

        if (!await _context.Municipios.AnyAsync(m => m.Id == dto.MunicipioId))
        {
            return NotFound($"El municipio con id {dto.MunicipioId} no existe.");
        }

        anfitrione.MunicipioId = dto.MunicipioId;
        anfitrione.Nombre = dto.Nombre;
        anfitrione.Email = dto.Email;
        anfitrione.Telefono = dto.Telefono;
        anfitrione.Direccion = dto.Direccion;
        anfitrione.UpdatedAt = DateTime.UtcNow;

        _context.Entry(anfitrione).State = EntityState.Modified;

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
    public async Task<ActionResult<AnfitrioneEntity>> PostAnfitrione(CreateAnfitrioneDto dto)
    {
        if (!await _context.Municipios.AnyAsync(m => m.Id == dto.MunicipioId))
        {
            return NotFound($"El municipio con id {dto.MunicipioId} no existe.");
        }

        var anfitrione = new AnfitrioneEntity
        {
            MunicipioId = dto.MunicipioId,
            Nombre = dto.Nombre,
            Email = dto.Email,
            Telefono = dto.Telefono,
            Direccion = dto.Direccion,
            Verificado = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.Anfitriones.Add(anfitrione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAnfitrione), new { id = anfitrione.Id }, anfitrione);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAnfitrione(int id)
    {
        var anfitrione = await _context.Anfitriones.FindAsync(id);

        if (anfitrione == null)
        {
            return NotFound();
        }

        _context.Anfitriones.Remove(anfitrione);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
