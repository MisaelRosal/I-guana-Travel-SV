using IguanaSV.Api.DTOs;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
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
    public async Task<ActionResult<IEnumerable<Anfitrione>>> GetAnfitriones()
    {
        return await _context.Anfitriones
            .Include(a => a.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(a => a.Publicaciones)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Anfitrione>> GetAnfitrione(int id)
    {
        var anfitrione = await _context.Anfitriones
            .Include(a => a.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(a => a.Publicaciones)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (anfitrione == null)
        {
            return NotFound();
        }

        return anfitrione;
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> PutAnfitrione(int id, Anfitrione anfitrione)
    {
        if (id != anfitrione.Id)
        {
            return BadRequest();
        }

        var exists = await _context.Anfitriones.AnyAsync(a => a.Id == id);

        if (!exists)
        {
            return NotFound();
        }

        if (!await _context.Municipios.AnyAsync(m => m.Id == anfitrione.MunicipioId))
        {
            return NotFound($"El municipio con id {anfitrione.MunicipioId} no existe.");
        }

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

    [HttpPut("{id}/verificacion")]
    public async Task<IActionResult> PutVerificacion(int id, [FromBody] bool verificado)
    {
        var anfitrione = await _context.Anfitriones.FindAsync(id);

        if (anfitrione == null)
        {
            return NotFound();
        }

        anfitrione.Verificado = verificado;
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPut("{id}/perfil")]
    public async Task<IActionResult> PutPerfil(int id, ActualizarPerfilAnfitrionRequest request)
    {
        var anfitrione = await _context.Anfitriones.FindAsync(id);

        if (anfitrione == null)
        {
            return NotFound(new { mensaje = "El anfitrión no existe." });
        }

        anfitrione.Descripcion = request.Descripcion?.Trim();
        await _context.SaveChangesAsync();

        return Ok(anfitrione);
    }

    [HttpPost]
    public async Task<ActionResult<Anfitrione>> PostAnfitrione(Anfitrione anfitrione)
    {
        if (!await _context.Municipios.AnyAsync(m => m.Id == anfitrione.MunicipioId))
        {
            return NotFound($"El municipio con id {anfitrione.MunicipioId} no existe.");
        }

        _context.Anfitriones.Add(anfitrione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAnfitrione), new { id = anfitrione.Id }, anfitrione);
    }

    [HttpPost("registrar")]
    public async Task<ActionResult<Anfitrione>> RegistrarAnfitrion(RegistroAnfitrionRequest request)
    {
        var usuario = await _context.Usuarios.FindAsync(request.UsuarioId);
        if (usuario == null)
        {
            return NotFound(new { mensaje = "El usuario no existe." });
        }

        if (!await _context.Municipios.AnyAsync(m => m.Id == request.MunicipioId))
        {
            return NotFound(new { mensaje = "El municipio no existe." });
        }

        var yaEsAnfitrion = await _context.Anfitriones.AnyAsync(a => a.UsuarioId == request.UsuarioId);
        if (yaEsAnfitrion)
        {
            return Conflict(new { mensaje = "Este usuario ya es anfitrión." });
        }

        var anfitrione = new Anfitrione
        {
            UsuarioId = request.UsuarioId,
            MunicipioId = request.MunicipioId,
            Nombre = request.Nombre.Trim(),
            Email = request.Email.Trim().ToLowerInvariant(),
            Telefono = request.Telefono?.Trim(),
            Direccion = request.Direccion?.Trim(),
            Descripcion = request.Descripcion?.Trim(),
            FotoPerfil = request.FotoPerfil,
            Verificado = false,
        };

        _context.Anfitriones.Add(anfitrione);
        usuario.Rol = "anfitrion";
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