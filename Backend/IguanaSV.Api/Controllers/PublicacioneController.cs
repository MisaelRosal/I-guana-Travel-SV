using PublicacioneEntity = IguanaSV.Api.Entities.Publicacione;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PublicacioneController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IEmailNotificationService _notificaciones;

    public PublicacioneController(IguanasDbContext context, IEmailNotificationService notificaciones)
    {
        _context = context;
        _notificaciones = notificaciones;
    }

    // Catalog reads stay anonymous (spec: "Public read, protected write").
    [HttpGet]
    public async Task<ActionResult<IEnumerable<PublicacioneEntity>>> GetPublicaciones()
    {
        return await _context.Publicaciones
            .AsNoTracking()
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PublicacioneEntity>> GetPublicacione(int id)
    {
        var publicacione = await _context.Publicaciones
            .AsNoTracking()
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (publicacione == null)
        {
            return NotFound();
        }

        return publicacione;
    }

    // By-host listing includes reservations (guest PII): owner-of-the-host or admin only.
    [HttpGet("anfitrion/{anfitrionId}")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Publicacione>>> GetPublicacionesByAnfitrion(int anfitrionId)
    {
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsAnfitrionAsync(anfitrionId))
        {
            return Forbid();
        }

        return await _context.Publicaciones
            .AsNoTracking()
            .Include(p => p.Anfitrion)
                .ThenInclude(a => a.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(p => p.Municipio)
                .ThenInclude(m => m.Departamento)
            .Include(p => p.Categoria)
            .Include(p => p.Experiencia)
            .Include(p => p.Horarios)
            .Include(p => p.ImagenesPublicacions)
            .Include(p => p.PublicacionAmenidads)
                .ThenInclude(pa => pa.Amenidad)
            .Include(p => p.Reservas)
            .Where(p => p.AnfitrionId == anfitrionId)
            .ToListAsync();
    }

    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> PutPublicacione(int id, CreatePublicacioneDto dto)
    {
        var publicacione = await _context.Publicaciones.FindAsync(id);

        if (publicacione == null)
        {
            return NotFound();
        }

        // Owner-or-admin gate (spec: "Publication ownership gate"). Ownership is
        // resolved from the DB host row (Anfitriones.UsuarioId == sub) so role
        // changes apply immediately; a non-admin must own BOTH the current host
        // and the target host, which closes silent re-assignment of a publication
        // to another anfitrión through the body.
        if (!User.IsInRole(AuthConstants.AdminRole))
        {
            if (!await CallerOwnsPublicationAsync(id) || !await CallerOwnsAnfitrionAsync(dto.AnfitrionId))
            {
                return Forbid();
            }
        }

        if (!await _context.Anfitriones.AnyAsync(a => a.Id == dto.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {dto.AnfitrionId} no existe.");
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == dto.CategoriaId))
        {
            return NotFound($"La categoria con id {dto.CategoriaId} no existe.");
        }

        if (dto.Tipo != null && dto.Tipo != "hospedaje" && dto.Tipo != "experiencia")
        {
            return BadRequest(new { mensaje = "El tipo debe ser 'hospedaje' o 'experiencia'." });
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
        if (dto.Tipo != null)
        {
            publicacione.Tipo = dto.Tipo;
        }
        if (dto.MunicipioId.HasValue)
        {
            publicacione.MunicipioId = dto.MunicipioId;
        }
        publicacione.UpdatedAt = DateTime.Now;

        var existente = await _context.Publicaciones
            .Include(p => p.PublicacionAmenidads)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (existente == null)
        {
            return NotFound();
        }

        existente.AnfitrionId = publicacione.AnfitrionId;
        existente.CategoriaId = publicacione.CategoriaId;
        existente.Tipo = publicacione.Tipo;
        existente.Titulo = publicacione.Titulo;
        existente.Descripcion = publicacione.Descripcion;
        existente.PrecioPorNoche = publicacione.PrecioPorNoche;
        existente.CapacidadMaxima = publicacione.CapacidadMaxima;
        existente.Habitaciones = publicacione.Habitaciones;
        existente.Camas = publicacione.Camas;
        existente.Banos = publicacione.Banos;
        existente.DireccionExacta = publicacione.DireccionExacta;
        existente.Latitud = publicacione.Latitud;
        existente.Longitud = publicacione.Longitud;
        existente.MunicipioId = publicacione.MunicipioId;
        existente.Estado = publicacione.Estado;

        var idsSolicitados = (dto.PublicacionAmenidads ?? new List<CreatePublicacionAmenidadDto>())
            .Where(pa => pa.AmenidadId != 0)
            .Select(pa => pa.AmenidadId)
            .ToHashSet();

        var aBorrar = existente.PublicacionAmenidads
            .Where(pa => !idsSolicitados.Contains(pa.AmenidadId))
            .ToList();
        _context.PublicacionAmenidads.RemoveRange(aBorrar);

        var idsExistentes = existente.PublicacionAmenidads.Select(pa => pa.AmenidadId).ToHashSet();
        foreach (var amenidadId in idsSolicitados)
        {
            if (!idsExistentes.Contains(amenidadId))
            {
                _context.PublicacionAmenidads.Add(new PublicacionAmenidad
                {
                    PublicacionId = id,
                    AmenidadId = amenidadId,
                });
            }
        }

        // Horarios: el frontend manda la lista completa, se reemplazan
        var horariosActuales = await _context.Horarios
            .Where(h => h.PublicacionId == id)
            .ToListAsync();
        _context.Horarios.RemoveRange(horariosActuales);

        foreach (var h in dto.Horarios ?? new List<CreateHorarioDto>())
        {
            _context.Horarios.Add(new Horario
            {
                PublicacionId = id,
                DiaSemana = h.DiaSemana,
                Fecha = h.Fecha,
                HoraInicio = h.HoraInicio,
                HoraFin = h.HoraFin,
            });
        }

        // Experiencia: mismo criterio, se reemplaza
        var experienciasActuales = await _context.Experiencias
            .Where(e => e.PublicacionId == id)
            .ToListAsync();
        _context.Experiencias.RemoveRange(experienciasActuales);

        foreach (var e in dto.Experiencia ?? new List<CreateExperienciaDto>())
        {
            _context.Experiencias.Add(new Experiencia
            {
                PublicacionId = id,
                Nombre = e.Nombre,
                Descripcion = e.Descripcion,
                DuracionHoras = e.DuracionHoras,
                PrecioAdicional = e.PrecioAdicional,
            });
        }

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
    [Authorize]
    public async Task<ActionResult<PublicacioneEntity>> PostPublicacione(CreatePublicacioneDto dto)
    {
        if (!await _context.Anfitriones.AnyAsync(a => a.Id == dto.AnfitrionId))
        {
            return NotFound($"El anfitrion con id {dto.AnfitrionId} no existe.");
        }

        // A non-admin may only publish under a host record they own.
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsAnfitrionAsync(dto.AnfitrionId))
        {
            return Forbid();
        }

        if (!await _context.Categorias.AnyAsync(c => c.Id == dto.CategoriaId))
        {
            return NotFound($"La categoria con id {dto.CategoriaId} no existe.");
        }

if (dto.Tipo != null && dto.Tipo != "hospedaje" && dto.Tipo != "experiencia")
        {
            return BadRequest(new { mensaje = "El tipo debe ser 'hospedaje' o 'experiencia'." });
        }

        if (dto.PrecioPorNoche < 0)
        {
            return BadRequest("El precio por noche no puede ser negativo.");
        }

        var publicacione = new PublicacioneEntity
        {
            AnfitrionId = dto.AnfitrionId,
            CategoriaId = dto.CategoriaId,
            Tipo = dto.Tipo ?? "experiencia",
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
            MunicipioId = dto.MunicipioId,
            Estado = dto.Estado ?? "activo",
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now,
            Horarios = (dto.Horarios ?? new List<CreateHorarioDto>())
                .Select(h => new Horario
                {
                    DiaSemana = h.DiaSemana,
                    Fecha = h.Fecha,
                    HoraInicio = h.HoraInicio,
                    HoraFin = h.HoraFin,
                })
                .ToList(),
            Experiencia = (dto.Experiencia ?? new List<CreateExperienciaDto>())
                .Select(e => new Experiencia
                {
                    Nombre = e.Nombre,
                    Descripcion = e.Descripcion,
                    DuracionHoras = e.DuracionHoras,
                    PrecioAdicional = e.PrecioAdicional,
                })
                .ToList(),
            PublicacionAmenidads = (dto.PublicacionAmenidads ?? new List<CreatePublicacionAmenidadDto>())
                .Where(pa => pa.AmenidadId != 0)
                .Select(pa => new PublicacionAmenidad { AmenidadId = pa.AmenidadId })
                .ToList()
        };

        _context.Publicaciones.Add(publicacione);
        await _context.SaveChangesAsync();

        // Tell the account owner, resolved through the host row's usuario link —
        // the anfitriones.email contact column is not the login mailbox.
        var anfitrion = await _context.Anfitriones
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == publicacione.AnfitrionId);
        if (anfitrion?.UsuarioId is int duenioId)
        {
            var duenio = await _context.Usuarios.FindAsync(duenioId);
            if (duenio != null)
            {
                await _notificaciones.PublicacionCreadaAsync(
                    duenio.Email, duenio.Nombre, publicacione.Titulo ?? "tu nueva publicación");
            }
        }

        return CreatedAtAction(nameof(GetPublicacione), new { id = publicacione.Id }, publicacione);
    }

    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> DeletePublicacione(int id)
    {
        var publicacione = await _context.Publicaciones.FindAsync(id);

        if (publicacione == null)
        {
            return NotFound();
        }

        // Owner-or-admin gate (spec: "Publication ownership gate").
        if (!User.IsInRole(AuthConstants.AdminRole) && !await CallerOwnsPublicationAsync(id))
        {
            return Forbid();
        }

        _context.Publicaciones.Remove(publicacione);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // --- Ownership helpers (W3b mechanism) ------------------------------------
    // Deliberately plain controller-side checks (design TD4 "Ownership"): no
    // custom policy/attribute, so the gate reads top-to-bottom next to the
    // mutation it protects. Admin is a claim check (short TTL); publication
    // ownership is a DB query so host-link changes apply immediately.

    /// <summary>True when the token subject is linked to the given host row.</summary>
    private async Task<bool> CallerOwnsAnfitrionAsync(int anfitrionId)
    {
        var sub = User.GetSubjectId();
        return sub.HasValue
            && await _context.Anfitriones.AnyAsync(a => a.Id == anfitrionId && a.UsuarioId == sub.Value);
    }

    /// <summary>True when the token subject owns the host behind the given publication.</summary>
    private async Task<bool> CallerOwnsPublicationAsync(int publicacionId)
    {
        var sub = User.GetSubjectId();
        return sub.HasValue
            && await _context.Publicaciones.AnyAsync(p => p.Id == publicacionId && p.Anfitrion!.UsuarioId == sub.Value);
    }
}
