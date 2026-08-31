using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PublicacioneController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public PublicacioneController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Publicacione>>> GetPublicaciones()
    {
        return await _context.Publicaciones
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .Include(p => p.Reservas)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Publicacione>> GetPublicacione(int id)
    {
        var publicacione = await _context.Publicaciones
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .Include(p => p.Reservas)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (publicacione == null)
        {
            return NotFound();
        }

        return publicacione;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutPublicacione(int id, Publicacione publicacione)
    {
        if (id != publicacione.Id)
        {
            return BadRequest();
        }

        var exists = await _context.Publicaciones.AnyAsync(p => p.Id == id);

        if (!exists)
        {
            return NotFound();
        }

        if (!await _context.Anfitriones.AnyAsync(a => a.Id == publicacione.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {publicacione.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == publicacione.CategoriaId))
        {
            return NotFound($"La categoria con id {publicacione.CategoriaId} no existe.");
        }

        if (publicacione.PrecioPorNoche < 0)
        {
            return BadRequest("El precio por noche no puede ser negativo.");
        }

        _context.Entry(publicacione).State = EntityState.Modified;

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
    public async Task<ActionResult<Publicacione>> PostPublicacione(Publicacione publicacione)
    {
        if (!await _context.Anfitriones.AnyAsync(a => a.Id == publicacione.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {publicacione.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == publicacione.CategoriaId))
        {
            return NotFound($"La categoria con id {publicacione.CategoriaId} no existe.");
        }

        if (publicacione.PrecioPorNoche < 0)
        {
            return BadRequest("El precio por noche no puede ser negativo.");
        }

        _context.Publicaciones.Add(publicacione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetPublicacione), new { id = publicacione.Id }, publicacione);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePublicacione(int id)
    {
        var publicacione = await _context.Publicaciones.FindAsync(id);

        if (publicacione == null)
        {
            return NotFound();
        }

        _context.Publicaciones.Remove(publicacione);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
