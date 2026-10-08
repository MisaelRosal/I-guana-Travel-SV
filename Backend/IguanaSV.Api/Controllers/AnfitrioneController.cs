using IguanaSV.Api.Auth;
using IguanaSV.Api.DTOs;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnfitrioneController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IEmailNotificationService _notificaciones;

    public AnfitrioneController(IguanasDbContext context, IEmailNotificationService notificaciones)
    {
        _context = context;
        _notificaciones = notificaciones;
    }

    // PII bulk guard: the list is catalog data for anonymous/usuario callers,
    // so it is projected WITHOUT Email/Telefono/UsuarioId. Admin keeps the
    // full rows (the admin panel legitimately manages contact data); a host
    // reads their own full row through GET mi-perfil, never through this list.
    [HttpGet]
    public async Task<IActionResult> GetAnfitriones()
    {
        var anfitriones = await _context.Anfitriones
            .Include(a => a.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(a => a.Publicaciones)
            .ToListAsync();

        if (User.IsInRole(AuthConstants.AdminRole))
        {
            return Ok(anfitriones);
        }

        return Ok(anfitriones.Select(ToCatalogo));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetAnfitrione(int id)
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

        // Email/Telefono are public by product decision (the host profile page
        // shows them), but the UsuarioId link is internal plumbing: only admin
        // and the owner ever see it back. Literal "mi-perfil" wins over this
        // {id} template in ASP.NET routing, so it cannot be swallowed.
        if (User.IsInRole(AuthConstants.AdminRole) || await CallerOwnsHostAsync(id))
        {
            return Ok(anfitrione);
        }

        return Ok(ToPublico(anfitrione));
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

        // Notify the account owner (not the anfitriones.email contact column):
        // the login credential's mailbox is the one they actually read.
        if (verificado && anfitrione.UsuarioId is int duenioId)
        {
            var duenio = await _context.Usuarios.FindAsync(duenioId);
            if (duenio != null)
            {
                await _notificaciones.AnfitrionVerificadoAsync(duenio.Email, duenio.Nombre);
            }
        }

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

    // ---- Self-service host profile (Mi perfil) ---------------------------------

    /// <summary>
    /// Own host row resolved from the token subject — never from a route id,
    /// so ownership cannot be forged. 404 when the logged-in user has no
    /// linked host row (plain usuarios and orphan links land here; the SPA
    /// falls back gracefully).
    /// </summary>
    [HttpGet("mi-perfil")]
    [Authorize]
    public async Task<IActionResult> GetMiPerfil()
    {
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        var anfitrione = await _context.Anfitriones
            .Include(a => a.Municipio)
                .ThenInclude(m => m.Departamento)
            .FirstOrDefaultAsync(a => a.UsuarioId == sub.Value);

        if (anfitrione == null)
        {
            return NotFound(new { mensaje = "El usuario no tiene un perfil de anfitrión." });
        }

        return Ok(await ToMiPerfilAsync(anfitrione));
    }

    /// <summary>
    /// Partial self-update of the contact fields (correo, teléfono, ubicación
    /// municipio-backed, descripción) of the CALLER's own host row. Owner-only
    /// by construction: the row comes from the token sub. Verificado and
    /// UsuarioId are not part of the payload and are never written here —
    /// editing a profile does not reset verification (same discipline as the
    /// PUT /{id} guard) nor re-links the row to another user. The email is
    /// anfitriones.email (contact), never the usuarios.email login credential.
    /// </summary>
    [HttpPut("mi-perfil")]
    [Authorize]
    public async Task<IActionResult> PutMiPerfil(EditarPerfilAnfitrionDto dto)
    {
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        var anfitrione = await _context.Anfitriones
            .Include(a => a.Municipio)
                .ThenInclude(m => m.Departamento)
            .FirstOrDefaultAsync(a => a.UsuarioId == sub.Value);

        if (anfitrione == null)
        {
            return NotFound(new { mensaje = "El usuario no tiene un perfil de anfitrión." });
        }

        if (dto.MunicipioId.HasValue
            && !await _context.Municipios.AnyAsync(m => m.Id == dto.MunicipioId.Value))
        {
            return BadRequest(new { mensaje = $"El municipio con id {dto.MunicipioId.Value} no existe." });
        }

        string? emailNormalizado = null;
        if (dto.Email != null)
        {
            emailNormalizado = dto.Email.Trim().ToLowerInvariant();
            if (emailNormalizado.Length == 0)
            {
                return BadRequest(new { mensaje = "El correo de contacto no puede quedar vacío." });
            }

            // Friendly pre-check against the anfitriones_email_key unique index
            // (same normalisation as registrar). The 23505 catch below still
            // closes the race between this check and the save.
            var enUso = await _context.Anfitriones
                .AnyAsync(a => a.Email == emailNormalizado && a.Id != anfitrione.Id);
            if (enUso)
            {
                return Conflict(new { mensaje = "Ese correo ya está registrado por otro anfitrión." });
            }
        }

        // Partial update: only provided fields are written, null keeps the
        // current value (pattern from PutPublicacione's dto-driven assigns).
        if (emailNormalizado != null) anfitrione.Email = emailNormalizado;
        if (dto.Telefono != null) anfitrione.Telefono = dto.Telefono.Trim();
        if (dto.MunicipioId.HasValue) anfitrione.MunicipioId = dto.MunicipioId.Value;
        if (dto.Descripcion != null) anfitrione.Descripcion = dto.Descripcion.Trim();

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // SQLSTATE 23505 on anfitriones_email_key: another host claimed
            // the address between the pre-check and the save. Same 409
            // { mensaje } payload (mirrors ReservaController's 23P01 mapping).
            return Conflict(new { mensaje = "Ese correo ya está registrado por otro anfitrión." });
        }

        // Re-read the row fresh: after a MunicipioId reassign the tracked
        // entity's Municipio navigation still points to the OLD municipio (the
        // new one is not tracked, so EF cannot fix it up), and the SPA syncs
        // both cascade selects from this response body.
        var actualizado = await _context.Anfitriones
            .AsNoTracking()
            .Include(a => a.Municipio)
                .ThenInclude(m => m.Departamento)
            .FirstAsync(a => a.Id == anfitrione.Id);

        var duenio = await _context.Usuarios.FindAsync(sub.Value);
        if (duenio != null)
        {
            await _notificaciones.PerfilAnfitrionActualizadoAsync(duenio.Email, duenio.Nombre);
        }

        return Ok(await ToMiPerfilAsync(actualizado));
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

        await _notificaciones.SeAnfitrionAsync(usuario.Email, usuario.Nombre);

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

    // --- Profile/list projections (PII) ----------------------------------------
    // Explicit DTO mapping, not attributes on the entity: which fields a
    // caller may see depends on the role/ownership of the REQUEST, and the
    // same Anfitrione row must serialize fully for admin and owner.

    private static AnfitrionCatalogoDto ToCatalogo(Anfitrione a) => new()
    {
        Id = a.Id,
        Nombre = a.Nombre,
        Descripcion = a.Descripcion,
        Direccion = a.Direccion,
        FotoPerfil = a.FotoPerfil,
        Verificado = a.Verificado,
        MunicipioId = a.MunicipioId,
        Municipio = ToMunicipio(a.Municipio),
    };

    private static AnfitrionPublicoDto ToPublico(Anfitrione a) => new()
    {
        Id = a.Id,
        Nombre = a.Nombre,
        Email = a.Email,
        Telefono = a.Telefono,
        Descripcion = a.Descripcion,
        Direccion = a.Direccion,
        FotoPerfil = a.FotoPerfil,
        Verificado = a.Verificado,
        MunicipioId = a.MunicipioId,
        Municipio = ToMunicipio(a.Municipio),
    };

    private async Task<MiPerfilAnfitrionDto> ToMiPerfilAsync(Anfitrione a)
    {
        // Counted instead of shipped as a collection: "Mi perfil" only shows
        // the number, and mi-perfil must not grow into a publications dump.
        var publicacionesCount = await _context.Publicaciones.CountAsync(p => p.AnfitrionId == a.Id);

        return new MiPerfilAnfitrionDto
        {
            Id = a.Id,
            Nombre = a.Nombre,
            Email = a.Email,
            Telefono = a.Telefono,
            Direccion = a.Direccion,
            Descripcion = a.Descripcion,
            FotoPerfil = a.FotoPerfil,
            Verificado = a.Verificado,
            MunicipioId = a.MunicipioId,
            Municipio = ToMunicipio(a.Municipio),
            PublicacionesCount = publicacionesCount,
        };
    }

    private static AnfitrionMunicipioDto? ToMunicipio(Municipio? m) => m is null
        ? null
        : new AnfitrionMunicipioDto
        {
            Id = m.Id,
            Nombre = m.Nombre,
            DepartamentoId = m.DepartamentoId,
            Departamento = m.Departamento is null
                ? null
                : new AnfitrionDepartamentoDto { Id = m.Departamento.Id, Nombre = m.Departamento.Nombre },
        };
}