using IguanaSV.Api.Auth;
using IguanaSV.Api.DTOs;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
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
    [Authorize]
    public async Task<IActionResult> PutAnfitrione(int id, Anfitrione anfitrione)
    {
        if (id != anfitrione.Id)
        {
            return BadRequest();
        }

        // AsNoTracking: the whole-entity attach below would otherwise clash with
        // a tracked instance of the same key.
        var existente = await _context.Anfitriones.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id);

        if (existente == null)
        {
            return NotFound();
        }

        // Owner-or-admin gate; a host row with no linked user is admin-only.
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsHostAsync(id))
        {
            return Forbid();
        }

        if (!await _context.Municipios.AnyAsync(m => m.Id == anfitrione.MunicipioId))
        {
            return NotFound($"El municipio con id {anfitrione.MunicipioId} no existe.");
        }

        // Verification flips and ownership (re)assignment belong to the dedicated
        // admin/owner paths (verificacion, registrar). Stripping them here closes
        // the whole-entity PUT that could self-verify or re-link a host row.
        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            anfitrione.Verificado = existente.Verificado;
            anfitrione.UsuarioId = existente.UsuarioId;
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

    // Spec: "Host verification is admin-only". Anonymous callers hit the
    // [Authorize] challenge (401); authenticated non-admins hit the role check
    // (403) before the handler ever runs.
    [HttpPut("{id}/verificacion")]
    [Authorize(Roles = AuthConstants.AdminRole)]
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
    [Authorize]
    public async Task<IActionResult> PutPerfil(int id, ActualizarPerfilAnfitrionRequest request)
    {
        var anfitrione = await _context.Anfitriones.FindAsync(id);

        if (anfitrione == null)
        {
            return NotFound(new { mensaje = "El anfitrión no existe." });
        }

        // Profile edits belong to the host themself (or an admin).
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsHostAsync(id))
        {
            return Forbid();
        }

        anfitrione.Descripcion = request.Descripcion?.Trim();
        await _context.SaveChangesAsync();

        return Ok(anfitrione);
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<Anfitrione>> PostAnfitrione(Anfitrione anfitrione)
    {
        // A non-admin may only create a host row for themself — the body's
        // UsuarioId is otherwise another mass-assignment surface.
        var sub = User.GetSubjectId();
        if (!User.IsInRole(AuthConstants.AdminRole)
            && (!anfitrione.UsuarioId.HasValue || anfitrione.UsuarioId.Value != sub))
        {
            return Forbid();
        }

        if (!await _context.Municipios.AnyAsync(m => m.Id == anfitrione.MunicipioId))
        {
            return NotFound($"El municipio con id {anfitrione.MunicipioId} no existe.");
        }

        _context.Anfitriones.Add(anfitrione);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAnfitrione), new { id = anfitrione.Id }, anfitrione);
    }

    [HttpPost("registrar")]
    [Authorize]
    public async Task<ActionResult<Anfitrione>> RegistrarAnfitrion(RegistroAnfitrionRequest request)
    {
        // Spec: "Registrar binds identity from the token". The subject comes
        // from the verified cookie; RegistroAnfitrionRequest no longer carries a
        // UsuarioId at all, so a body-supplied id cannot promote anyone else.
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        var usuario = await _context.Usuarios.FindAsync(sub.Value);
        if (usuario == null)
        {
            return NotFound(new { mensaje = "El usuario no existe." });
        }

        if (!await _context.Municipios.AnyAsync(m => m.Id == request.MunicipioId))
        {
            return NotFound(new { mensaje = "El municipio no existe." });
        }

        var yaEsAnfitrion = await _context.Anfitriones.AnyAsync(a => a.UsuarioId == sub.Value);
        if (yaEsAnfitrion)
        {
            return Conflict(new { mensaje = "Este usuario ya es anfitrión." });
        }

        var anfitrione = new Anfitrione
        {
            UsuarioId = sub.Value,
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
        // Self-promotion usuario -> anfitrion is the documented non-admin role
        // change; never downgrade an admin who registers a host profile.
        if (usuario.Rol != AuthConstants.AdminRole)
        {
            usuario.Rol = "anfitrion";
        }
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAnfitrione), new { id = anfitrione.Id }, anfitrione);
    }

    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> DeleteAnfitrione(int id)
    {
        var anfitrione = await _context.Anfitriones.FindAsync(id);

        if (anfitrione == null)
        {
            return NotFound();
        }

        // Spec: destructive host routes require auth plus owner/admin. Orphan
        // host rows (no linked user) are admin-only.
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsHostAsync(id))
        {
            return Forbid();
        }

        _context.Anfitriones.Remove(anfitrione);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// True when the token subject is the user linked to this host row
    /// (Anfitriones.UsuarioId == sub). Rows with a NULL link are never owned
    /// by a non-admin caller.
    /// </summary>
    private async Task<bool> CallerOwnsHostAsync(int anfitrionId)
    {
        var sub = User.GetSubjectId();
        return sub.HasValue
            && await _context.Anfitriones.AnyAsync(a => a.Id == anfitrionId && a.UsuarioId == sub.Value);
    }
}