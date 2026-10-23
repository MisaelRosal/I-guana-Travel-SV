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
    private readonly IPublicationTranslationService _translationService;
    private readonly ILogger<PublicacioneController> _logger;

    public PublicacioneController(
        IguanasDbContext context,
        IEmailNotificationService notificaciones,
        IPublicationTranslationService translationService,
        ILogger<PublicacioneController> logger)
    {
        _context = context;
        _notificaciones = notificaciones;
        _translationService = translationService;
        _logger = logger;
    }

    // Catalog reads stay anonymous (spec: "Public read, protected write").
    [HttpGet]
    public async Task<ActionResult<IEnumerable<PublicacioneEntity>>> GetPublicaciones(
        [FromQuery] string? contentLocale = null)
    {
        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var publicaciones = await _context.Publicaciones
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

        PublicacionContentLocale.ApplyContentLocale(publicaciones, locale);
        return publicaciones;
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PublicacioneEntity>> GetPublicacione(
        int id,
        [FromQuery] string? contentLocale = null)
    {
        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

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

        PublicacionContentLocale.ApplyContentLocale(publicacione, locale);
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

        var tituloAnterior = publicacione.Titulo;
        var descripcionAnterior = publicacione.Descripcion;
        var tituloCambio = !string.Equals(tituloAnterior, dto.Titulo, StringComparison.Ordinal);
        var descripcionCambio = !string.Equals(descripcionAnterior, dto.Descripcion, StringComparison.Ordinal);

        publicacione.AnfitrionId = dto.AnfitrionId;
        publicacione.CategoriaId = dto.CategoriaId;
        publicacione.Titulo = dto.Titulo;
        publicacione.Descripcion = dto.Descripcion;
        if (tituloCambio)
        {
            publicacione.TituloEn = null;
        }
        if (descripcionCambio)
        {
            publicacione.DescripcionEn = null;
        }
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
                Disponible = h.Disponible ?? true,
                Cupos = h.Cupos,
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

        await TranslateAndPersistIfMissingAsync(publicacione, HttpContext.RequestAborted);
        await TranslateExperienceFieldsAsync(id, HttpContext.RequestAborted);

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
                    Disponible = h.Disponible ?? true,
                    Cupos = h.Cupos,
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

        await TranslateAndPersistIfMissingAsync(publicacione, HttpContext.RequestAborted);
        await TranslateExperienceFieldsAsync(publicacione.Id, HttpContext.RequestAborted);

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

    [HttpPost("traducir-pendientes")]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<IActionResult> TranslatePending(
        [FromQuery] int batchSize = 25,
        [FromQuery] int? afterId = null,
        CancellationToken cancellationToken = default)
    {
        if (batchSize is < 1 or > 25)
        {
            return BadRequest(new { mensaje = "batchSize must be between 1 and 25." });
        }

        if (afterId is < 0)
        {
            return BadRequest(new { mensaje = "afterId must be zero or greater." });
        }

        var candidatos = await _context.Publicaciones
            .AsNoTracking()
            .Where(p => (!afterId.HasValue || p.Id > afterId.Value)
                && (p.TituloEn == null
                    || (p.Descripcion != null && p.Descripcion.Trim() != "" && p.DescripcionEn == null)))
            .OrderBy(p => p.Id)
            .Take(batchSize + 1)
            .ToListAsync(cancellationToken);

        var hasMore = candidatos.Count > batchSize;
        var procesar = candidatos.Take(batchSize).ToList();
        var processedCount = 0;
        var translatedCount = 0;
        var failedCount = 0;
        var nextAfterId = afterId;

        foreach (var publicacion in procesar)
        {
            var result = await TranslateAndPersistIfMissingAsync(publicacion, cancellationToken);
            if (!result.Completed)
            {
                failedCount = 1;
                hasMore = true;
                break;
            }

            processedCount++;
            if (result.Translated)
            {
                translatedCount++;
            }
            nextAfterId = publicacion.Id;
        }

        return Ok(new
        {
            processedCount,
            translatedCount,
            failedCount,
            nextAfterId,
            hasMore,
        });
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

    private async Task<TranslationPersistenceResult> TranslateAndPersistIfMissingAsync(
        PublicacioneEntity publicacion,
        CancellationToken cancellationToken)
    {
        var translateTitle = publicacion.TituloEn is null;
        var translateDescription = publicacion.DescripcionEn is null
            && !string.IsNullOrWhiteSpace(publicacion.Descripcion);

        if (!translateTitle && !translateDescription)
        {
            return new TranslationPersistenceResult(true, false);
        }

        try
        {
            var translation = await _translationService.TranslateMissingAsync(
                publicacion.Id,
                publicacion.Titulo,
                publicacion.Descripcion,
                translateTitle,
                translateDescription,
                cancellationToken);

            if (translation is null)
            {
                return new TranslationPersistenceResult(false, false);
            }

            var titleEnglish = translateTitle && !string.IsNullOrWhiteSpace(translation.TitleEnglish)
                ? translation.TitleEnglish
                : null;
            var descriptionEnglish = translateDescription && !string.IsNullOrWhiteSpace(translation.DescriptionEnglish)
                ? translation.DescriptionEnglish
                : null;

            if (titleEnglish is null && descriptionEnglish is null)
            {
                return new TranslationPersistenceResult(false, false);
            }

            var currentSource = _context.Publicaciones
                .Where(p => p.Id == publicacion.Id
                    && p.Titulo == publicacion.Titulo
                    && p.Descripcion == publicacion.Descripcion);
            var updated = 0;

            if (titleEnglish is not null)
            {
                updated += await currentSource
                    .Where(p => p.TituloEn == null)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(p => p.TituloEn, titleEnglish), cancellationToken);
            }

            if (descriptionEnglish is not null)
            {
                updated += await currentSource
                    .Where(p => p.DescripcionEn == null)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(p => p.DescripcionEn, descriptionEnglish), cancellationToken);
            }

            // A newer edit/translation won the race. Treat the attempt as complete
            // only if no current source field still needs a translation; otherwise
            // the backfill cursor stays before this publication for a safe retry.
            var stillPending = await _context.Publicaciones
                .AsNoTracking()
                .AnyAsync(p => p.Id == publicacion.Id
                    && (p.TituloEn == null
                        || (p.Descripcion != null && p.Descripcion.Trim() != "" && p.DescripcionEn == null)),
                    cancellationToken);

            return new TranslationPersistenceResult(!stillPending, updated > 0);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            var failureCategory = $"persistence_error_{exception.GetType().Name}";
            _logger.LogWarning(
                "Publication translation persistence failed for publication {PublicationId}: {FailureCategory}",
                publicacion.Id,
                failureCategory);
            return new TranslationPersistenceResult(false, false);
        }
    }

    private async Task TranslateExperienceFieldsAsync(int publicacionId, CancellationToken cancellationToken)
    {
        try
        {
            var experiencias = await _context.Experiencias
                .Where(experiencia => experiencia.PublicacionId == publicacionId)
                .ToListAsync(cancellationToken);

            foreach (var experiencia in experiencias)
            {
                var translateName = experiencia.NombreEn is null;
                var translateDescription = experiencia.DescripcionEn is null
                    && !string.IsNullOrWhiteSpace(experiencia.Descripcion);
                var texts = new List<string>(2);
                var nameIndex = -1;
                var descriptionIndex = -1;

                if (translateName && !string.IsNullOrWhiteSpace(experiencia.Nombre))
                {
                    nameIndex = texts.Count;
                    texts.Add(experiencia.Nombre);
                }
                if (translateDescription)
                {
                    descriptionIndex = texts.Count;
                    texts.Add(experiencia.Descripcion!);
                }
                if (texts.Count == 0 || texts.Any(text => text.Length > 1200))
                {
                    continue;
                }

                var translated = await _translationService.TranslateBatchAsync(
                    experiencia.Id,
                    "experience",
                    texts,
                    cancellationToken);
                if (translated is null || translated.Count != texts.Count)
                {
                    continue;
                }

                var currentSource = _context.Experiencias.Where(item =>
                    item.Id == experiencia.Id
                    && item.Nombre == experiencia.Nombre
                    && item.Descripcion == experiencia.Descripcion);
                if (nameIndex >= 0)
                {
                    await currentSource
                        .Where(item => item.NombreEn == null)
                        .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.NombreEn, translated[nameIndex]), cancellationToken);
                }
                if (descriptionIndex >= 0)
                {
                    await currentSource
                        .Where(item => item.DescripcionEn == null)
                        .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.DescripcionEn, translated[descriptionIndex]), cancellationToken);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                "Experience translation persistence failed for publication {PublicationId}: {FailureCategory}",
                publicacionId,
                $"persistence_error_{exception.GetType().Name}");
        }
    }

    private sealed record TranslationPersistenceResult(bool Completed, bool Translated);
}
