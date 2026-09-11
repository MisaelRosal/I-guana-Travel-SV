using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CategoriaController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public CategoriaController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Categoria>>> GetCategorias([FromQuery] string? tipo = null)
    {
        var query = _context.Categorias
            .Include(c => c.Publicaciones)
            .AsQueryable();

        if (!string.IsNullOrEmpty(tipo))
        {
            query = query.Where(c => c.Tipo == tipo);
        }

        return await query.ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Categoria>> GetCategoria(int id)
    {
        var categoria = await _context.Categorias
            .Include(c => c.Publicaciones)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (categoria == null)
        {
            return NotFound();
        }

        return categoria;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutCategoria(int id, Categoria categoria)
    {
        if (id != categoria.Id)
        {
            return BadRequest();
        }

        if (categoria.Tipo != "hospedaje" && categoria.Tipo != "experiencia")
        {
            return BadRequest(new { mensaje = "El tipo debe ser 'hospedaje' o 'experiencia'." });
        }

        var exists = await _context.Categorias.AnyAsync(c => c.Id == id);

        if (!exists)
        {
            return NotFound();
        }

        _context.Entry(categoria).State = EntityState.Modified;

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
    public async Task<ActionResult<Categoria>> PostCategoria(Categoria categoria)
    {
        if (categoria.Tipo != "hospedaje" && categoria.Tipo != "experiencia")
        {
            return BadRequest(new { mensaje = "El tipo debe ser 'hospedaje' o 'experiencia'." });
        }

        _context.Categorias.Add(categoria);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetCategoria), new { id = categoria.Id }, categoria);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCategoria(int id)
    {
        var categoria = await _context.Categorias.FindAsync(id);

        if (categoria == null)
        {
            return NotFound();
        }

        _context.Categorias.Remove(categoria);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}