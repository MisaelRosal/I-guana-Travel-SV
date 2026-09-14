using MunicipioEntity = IguanaSV.Api.Entities.Municipio;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MunicipioController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public MunicipioController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MunicipioEntity>>> GetMunicipios()
    {
        return await _context.Municipios
            .Include(m => m.Departamento)
            .Include(m => m.Anfitriones)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MunicipioEntity>> GetMunicipio(int id)
    {
        var municipio = await _context.Municipios
            .Include(m => m.Departamento)
            .Include(m => m.Anfitriones)
            .FirstOrDefaultAsync(m => m.Id == id);

        if (municipio == null)
        {
            return NotFound();
        }

        return municipio;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutMunicipio(int id, CreateMunicipioDto dto)
    {
        var municipio = await _context.Municipios.FindAsync(id);

        if (municipio == null)
        {
            return NotFound();
        }

        if (!await _context.Departamentos.AnyAsync(d => d.Id == dto.DepartamentoId))
        {
            return NotFound($"El departamento con id {dto.DepartamentoId} no existe.");
        }

        municipio.DepartamentoId = dto.DepartamentoId;
        municipio.Nombre = dto.Nombre;
        municipio.UpdatedAt = DateTime.UtcNow;

        _context.Entry(municipio).State = EntityState.Modified;

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
    public async Task<ActionResult<MunicipioEntity>> PostMunicipio(CreateMunicipioDto dto)
    {
        if (!await _context.Departamentos.AnyAsync(d => d.Id == dto.DepartamentoId))
        {
            return NotFound($"El departamento con id {dto.DepartamentoId} no existe.");
        }

        var municipio = new MunicipioEntity
        {
            DepartamentoId = dto.DepartamentoId,
            Nombre = dto.Nombre,
            CreatedAt = DateTime.UtcNow
        };

        _context.Municipios.Add(municipio);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetMunicipio), new { id = municipio.Id }, municipio);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMunicipio(int id)
    {
        var municipio = await _context.Municipios.FindAsync(id);

        if (municipio == null)
        {
            return NotFound();
        }

        _context.Municipios.Remove(municipio);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
