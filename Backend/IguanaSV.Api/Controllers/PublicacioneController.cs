using PublicacioneEntity = IguanaSV.Api.Entities.Publicacione;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
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
    public async Task<ActionResult<IEnumerable<PublicacioneEntity>>> GetPublicaciones()
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
    public async Task<ActionResult<PublicacioneEntity>> GetPublicacione(int id)
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
    public async Task<IActionResult> PutPublicacione(int id, CreatePublicacioneDto dto)
    {
        var publicacione = await _context.Publicaciones.FindAsync(id);

        if (publicacione == null)
        {
            return NotFound();
        }

        if (!await _context.Anfitriones.AnyAsync(a => a.Id == dto.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {dto.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == dto.CategoriaId))
        {
            return NotFound($"La categoria con id {dto.CategoriaId} no existe.");
        }

        publicacione.AnfitrionId = dto.AnfitrionId;
        publicacione.CategoriaId = dto.CategoriaId;
        publicacione.Titulo = dto.Titulo;
        publicacione.Descripcion = dto.Descripcion;
        publicacione.PrecioPorNoche = dto.PrecioPorNoche;
        publicacione.CapacidadMaxima = dto.CapacidadMaxima;
        publicacione.Habitaciones = dto.Habitaciones;
        publicacione.Camas = dto.Camas;
        publicacione.Banos = dto.Banos;
        publicacione.DireccionExacta = dto.DireccionExacta;
        publicacione.Latitud = dto.Latitud;
        publicacione.Longitud = dto.Longitud;
        publicacione.UpdatedAt = DateTime.UtcNow;

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
    public async Task<ActionResult<PublicacioneEntity>> PostPublicacione(CreatePublicacioneDto dto)
    {
        if (!await _context.Anfitriones.AnyAsync(a => a.Id == dto.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {dto.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == dto.CategoriaId))
        {
            return NotFound($"La categoria con id {dto.CategoriaId} no existe.");
        }

        var publicacione = new PublicacioneEntity
        {
            AnfitrionId = dto.AnfitrionId,
            CategoriaId = dto.CategoriaId,
            Titulo = dto.Titulo,
            Descripcion = dto.Descripcion,
            PrecioPorNoche = dto.PrecioPorNoche,
            CapacidadMaxima = dto.CapacidadMaxima,
            Habitaciones = dto.Habitaciones,
            Camas = dto.Camas,
            Banos = dto.Banos,
            DireccionExacta = dto.DireccionExacta,
            Latitud = dto.Latitud,
            Longitud = dto.Longitud,
            Estado = "activo",
            CreatedAt = DateTime.UtcNow
        };

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
