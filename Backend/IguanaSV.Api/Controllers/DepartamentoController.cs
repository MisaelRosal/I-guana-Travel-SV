using DepartamentoEntity = IguanaSV.Api.Entities.Departamento;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DepartamentoController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public DepartamentoController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DepartamentoEntity>>> GetDepartamentos()
    {
        return await _context.Departamentos
            .Include(d => d.Municipios)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<DepartamentoEntity>> GetDepartamento(int id)
    {
        var departamento = await _context.Departamentos
            .Include(d => d.Municipios)
            .FirstOrDefaultAsync(d => d.Id == id);

        if (departamento == null)
        {
            return NotFound();
        }

        return departamento;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutDepartamento(int id, CreateDepartamentoDto dto)
    {
        var departamento = await _context.Departamentos.FindAsync(id);

        if (departamento == null)
        {
            return NotFound();
        }

        departamento.Nombre = dto.Nombre;
        departamento.UpdatedAt = DateTime.UtcNow;

        _context.Entry(departamento).State = EntityState.Modified;

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
    public async Task<ActionResult<DepartamentoEntity>> PostDepartamento(CreateDepartamentoDto dto)
    {
        var departamento = new DepartamentoEntity
        {
            Nombre = dto.Nombre,
            CreatedAt = DateTime.UtcNow
        };

        _context.Departamentos.Add(departamento);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetDepartamento), new { id = departamento.Id }, departamento);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDepartamento(int id)
    {
        var departamento = await _context.Departamentos.FindAsync(id);

        if (departamento == null)
        {
            return NotFound();
        }

        _context.Departamentos.Remove(departamento);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}