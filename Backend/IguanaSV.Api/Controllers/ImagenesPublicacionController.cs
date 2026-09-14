using ImagenesPublicacionEntity = IguanaSV.Api.Entities.ImagenesPublicacion;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ImagenesPublicacionController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public ImagenesPublicacionController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ImagenesPublicacionEntity>>> GetImagenesPublicacions()
    {
        return await _context.ImagenesPublicacions
            .Include(ip => ip.Publicacion)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ImagenesPublicacionEntity>> GetImagenesPublicacion(int id)
    {
        var imagenesPublicacion = await _context.ImagenesPublicacions
            .Include(ip => ip.Publicacion)
            .FirstOrDefaultAsync(ip => ip.Id == id);

        if (imagenesPublicacion == null)
        {
            return NotFound();
        }

        return imagenesPublicacion;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutImagenesPublicacion(int id, CreateImagenPublicacionDto dto)
    {
        var imagenesPublicacion = await _context.ImagenesPublicacions.FindAsync(id);

        if (imagenesPublicacion == null)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        imagenesPublicacion.PublicacionId = dto.PublicacionId;
        imagenesPublicacion.Url = dto.Url;
        imagenesPublicacion.EsPrincipal = dto.EsPrincipal;
        imagenesPublicacion.Orden = dto.Orden;
        imagenesPublicacion.UpdatedAt = DateTime.UtcNow;

        _context.Entry(imagenesPublicacion).State = EntityState.Modified;

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
    public async Task<ActionResult<ImagenesPublicacionEntity>> PostImagenesPublicacion(CreateImagenPublicacionDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var imagenesPublicacion = new ImagenesPublicacionEntity
        {
            PublicacionId = dto.PublicacionId,
            Url = dto.Url,
            EsPrincipal = dto.EsPrincipal,
            Orden = dto.Orden,
            CreatedAt = DateTime.UtcNow
        };

        _context.ImagenesPublicacions.Add(imagenesPublicacion);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetImagenesPublicacion), new { id = imagenesPublicacion.Id }, imagenesPublicacion);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteImagenesPublicacion(int id)
    {
        var imagenesPublicacion = await _context.ImagenesPublicacions.FindAsync(id);

        if (imagenesPublicacion == null)
        {
            return NotFound();
        }

        _context.ImagenesPublicacions.Remove(imagenesPublicacion);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
