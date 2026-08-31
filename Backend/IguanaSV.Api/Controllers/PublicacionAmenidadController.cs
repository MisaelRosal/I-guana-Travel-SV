using PublicacionAmenidadEntity = IguanaSV.Api.Entities.PublicacionAmenidad;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PublicacionAmenidadController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public PublicacionAmenidadController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PublicacionAmenidadEntity>>> GetPublicacionAmenidads()
    {
        return await _context.PublicacionAmenidads
            .Include(pa => pa.Publicacion)
            .Include(pa => pa.Amenidad)
            .ToListAsync();
    }

    [HttpGet("{publicacionId}/{amenidadId}")]
    public async Task<ActionResult<PublicacionAmenidadEntity>> GetPublicacionAmenidad(int publicacionId, int amenidadId)
    {
        var publicacionAmenidad = await _context.PublicacionAmenidads
            .Include(pa => pa.Publicacion)
            .Include(pa => pa.Amenidad)
            .FirstOrDefaultAsync(pa => pa.PublicacionId == publicacionId && pa.AmenidadId == amenidadId);

        if (publicacionAmenidad == null)
        {
            return NotFound();
        }

        return publicacionAmenidad;
    }

    [HttpPut("{publicacionId}/{amenidadId}")]
    public async Task<IActionResult> PutPublicacionAmenidad(int publicacionId, int amenidadId, CreatePublicacionAmenidadDto dto)
    {
        var exists = await _context.PublicacionAmenidads
            .AnyAsync(pa => pa.PublicacionId == publicacionId && pa.AmenidadId == amenidadId);

        if (!exists)
        {
            return NotFound();
        }

        if (publicacionId != dto.PublicacionId || amenidadId != dto.AmenidadId)
        {
            return BadRequest("Los IDs del body no coinciden con los de la ruta.");
        }

        return NoContent();
    }

    [HttpPost]
    public async Task<ActionResult<PublicacionAmenidadEntity>> PostPublicacionAmenidad(CreatePublicacionAmenidadDto dto)
    {
        var publicacionExists = await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId);
        if (!publicacionExists)
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var amenidadExists = await _context.Amenidades.AnyAsync(a => a.Id == dto.AmenidadId);
        if (!amenidadExists)
        {
            return NotFound($"La amenidad con id {dto.AmenidadId} no existe.");
        }

        var alreadyExists = await _context.PublicacionAmenidads
            .AnyAsync(pa => pa.PublicacionId == dto.PublicacionId && pa.AmenidadId == dto.AmenidadId);

        if (alreadyExists)
        {
            return Conflict("Esa relacion publicacion-amenidad ya existe.");
        }

        var publicacionAmenidad = new PublicacionAmenidadEntity
        {
            PublicacionId = dto.PublicacionId,
            AmenidadId = dto.AmenidadId,
            CreatedAt = DateTime.UtcNow
        };

        _context.PublicacionAmenidads.Add(publicacionAmenidad);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetPublicacionAmenidad), new { publicacionId = publicacionAmenidad.PublicacionId, amenidadId = publicacionAmenidad.AmenidadId }, publicacionAmenidad);
    }

    [HttpDelete("{publicacionId}/{amenidadId}")]
    public async Task<IActionResult> DeletePublicacionAmenidad(int publicacionId, int amenidadId)
    {
        var publicacionAmenidad = await _context.PublicacionAmenidads
            .FirstOrDefaultAsync(pa => pa.PublicacionId == publicacionId && pa.AmenidadId == amenidadId);

        if (publicacionAmenidad == null)
        {
            return NotFound();
        }

        _context.PublicacionAmenidads.Remove(publicacionAmenidad);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
