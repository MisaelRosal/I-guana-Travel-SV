using ExperienciaEntity = IguanaSV.Api.Entities.Experiencia;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExperienciaController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IContentTranslationService _translationService;
    private readonly ILogger<ExperienciaController> _logger;

    public ExperienciaController(
        IguanasDbContext context,
        IContentTranslationService? translationService = null,
        ILogger<ExperienciaController>? logger = null)
    {
        _context = context;
        _translationService = translationService ?? NoOpContentTranslationService.Instance;
        _logger = logger ?? NullLogger<ExperienciaController>.Instance;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ExperienciaEntity>>> GetExperiencias(
        [FromQuery] string? contentLocale = null)
    {
        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var experiencias = await _context.Experiencias
            .Include(e => e.Publicacion)
            .ToListAsync();
        ApplyContentLocale(experiencias, locale);
        return experiencias;
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ExperienciaEntity>> GetExperiencia(
        int id,
        [FromQuery] string? contentLocale = null)
    {
        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var experiencia = await _context.Experiencias
            .Include(e => e.Publicacion)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (experiencia == null)
        {
            return NotFound();
        }

        ApplyContentLocale(experiencia, locale);
        return experiencia;
    }

    [Authorize]
    [HttpPut("{id}")]
    public async Task<IActionResult> PutExperiencia(int id, CreateExperienciaDto dto)
    {
        var experiencia = await _context.Experiencias.FindAsync(id);

        if (experiencia == null)
        {
            return NotFound();
        }

        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var nombreCambio = !string.Equals(experiencia.Nombre, dto.Nombre, StringComparison.Ordinal);
        var descripcionCambio = !string.Equals(experiencia.Descripcion, dto.Descripcion, StringComparison.Ordinal);
        experiencia.PublicacionId = dto.PublicacionId;
        experiencia.Nombre = dto.Nombre;
        experiencia.Descripcion = dto.Descripcion;
        if (nombreCambio) experiencia.NombreEn = null;
        if (descripcionCambio) experiencia.DescripcionEn = null;
        experiencia.DuracionHoras = dto.DuracionHoras;
        experiencia.PrecioAdicional = dto.PrecioAdicional;
        experiencia.UpdatedAt = DateTime.Now;

        _context.Entry(experiencia).State = EntityState.Modified;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }

        await TranslateMissingAsync(experiencia, HttpContext.RequestAborted);

        return NoContent();
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ExperienciaEntity>> PostExperiencia(CreateExperienciaDto dto)
    {
        if (!await _context.Publicaciones.AnyAsync(p => p.Id == dto.PublicacionId))
        {
            return NotFound($"La publicacion con id {dto.PublicacionId} no existe.");
        }

        var experiencia = new ExperienciaEntity
        {
            PublicacionId = dto.PublicacionId,
            Nombre = dto.Nombre,
            Descripcion = dto.Descripcion,
            DuracionHoras = dto.DuracionHoras,
            PrecioAdicional = dto.PrecioAdicional,
            CreatedAt = DateTime.Now
        };

        _context.Experiencias.Add(experiencia);
        await _context.SaveChangesAsync();
        await TranslateMissingAsync(experiencia, HttpContext.RequestAborted);

        return CreatedAtAction(nameof(GetExperiencia), new { id = experiencia.Id }, experiencia);
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteExperiencia(int id)
    {
        var experiencia = await _context.Experiencias.FindAsync(id);

        if (experiencia == null)
        {
            return NotFound();
        }

        _context.Experiencias.Remove(experiencia);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task TranslateMissingAsync(ExperienciaEntity experiencia, CancellationToken cancellationToken)
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
            return;
        }

        try
        {
            var translated = await _translationService.TranslateBatchAsync(
                experiencia.Id,
                "experience",
                texts,
                cancellationToken);
            if (translated is null || translated.Count != texts.Count) return;

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
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                "Experience translation persistence failed for experience {ExperienceId}: {FailureCategory}",
                experiencia.Id,
                $"persistence_error_{exception.GetType().Name}");
        }
    }

    private static void ApplyContentLocale(IEnumerable<ExperienciaEntity> experiencias, string locale)
    {
        foreach (var experiencia in experiencias)
        {
            ApplyContentLocale(experiencia, locale);
        }
    }

    private static void ApplyContentLocale(ExperienciaEntity experiencia, string locale)
    {
        if (locale != "en") return;
        if (!string.IsNullOrWhiteSpace(experiencia.NombreEn)) experiencia.Nombre = experiencia.NombreEn;
        if (!string.IsNullOrWhiteSpace(experiencia.DescripcionEn)) experiencia.Descripcion = experiencia.DescripcionEn;
    }

}
