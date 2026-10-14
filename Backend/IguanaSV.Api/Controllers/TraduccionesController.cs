using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = AuthConstants.AdminRole)]
public sealed class TraduccionesController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IContentTranslationService _translationService;
    private readonly ILogger<TraduccionesController> _logger;

    public TraduccionesController(
        IguanasDbContext context,
        IContentTranslationService translationService,
        ILogger<TraduccionesController> logger)
    {
        _context = context;
        _translationService = translationService;
        _logger = logger;
    }

    [HttpPost("pendientes")]
    public async Task<IActionResult> TranslatePending(
        [FromQuery] string? tipo,
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

        return tipo?.Trim().ToLowerInvariant() switch
        {
            "anfitriones" => await TranslateHostsAsync(batchSize, afterId, cancellationToken),
            "experiencias" => await TranslateExperiencesAsync(batchSize, afterId, cancellationToken),
            "resenas" => await TranslateReviewsAsync(batchSize, afterId, cancellationToken),
            _ => BadRequest(new { mensaje = "tipo debe ser 'anfitriones', 'experiencias' o 'resenas'." }),
        };
    }

    private async Task<IActionResult> TranslateHostsAsync(
        int batchSize,
        int? afterId,
        CancellationToken cancellationToken)
    {
        var candidates = await _context.Anfitriones
            .AsNoTracking()
            .Where(host => (!afterId.HasValue || host.Id > afterId.Value)
                && host.DescripcionEn == null
                && host.Descripcion != null
                && host.Descripcion.Trim() != ""
                && host.Descripcion.Length <= 1200)
            .OrderBy(host => host.Id)
            .Take(batchSize + 1)
            .ToListAsync(cancellationToken);

        var hasMore = candidates.Count > batchSize;
        return Ok(await ProcessBatchAsync(
            candidates.Take(batchSize),
            afterId,
            hasMore,
            TranslateHostAsync,
            cancellationToken));
    }

    private async Task<IActionResult> TranslateExperiencesAsync(
        int batchSize,
        int? afterId,
        CancellationToken cancellationToken)
    {
        var candidates = await _context.Experiencias
            .AsNoTracking()
            .Where(experience => (!afterId.HasValue || experience.Id > afterId.Value)
                && (experience.NombreEn == null
                    || (experience.DescripcionEn == null
                        && experience.Descripcion != null
                        && experience.Descripcion.Trim() != ""))
                && experience.Nombre.Length <= 1200
                && (experience.Descripcion == null || experience.Descripcion.Length <= 1200))
            .OrderBy(experience => experience.Id)
            .Take(batchSize + 1)
            .ToListAsync(cancellationToken);

        var hasMore = candidates.Count > batchSize;
        return Ok(await ProcessBatchAsync(
            candidates.Take(batchSize),
            afterId,
            hasMore,
            TranslateExperienceAsync,
            cancellationToken));
    }

    private async Task<IActionResult> TranslateReviewsAsync(
        int batchSize,
        int? afterId,
        CancellationToken cancellationToken)
    {
        var candidates = await _context.Resenas
            .AsNoTracking()
            .Where(review => (!afterId.HasValue || review.Id > afterId.Value)
                && ((review.ComentarioEn == null
                        && review.Comentario != null
                        && review.Comentario.Trim() != "")
                    || (review.RespuestaAnfitrionEn == null
                        && review.RespuestaAnfitrion != null
                        && review.RespuestaAnfitrion.Trim() != ""))
                && (review.Comentario == null || review.Comentario.Length <= 1200)
                && (review.RespuestaAnfitrion == null || review.RespuestaAnfitrion.Length <= 1200))
            .OrderBy(review => review.Id)
            .Take(batchSize + 1)
            .ToListAsync(cancellationToken);

        var hasMore = candidates.Count > batchSize;
        return Ok(await ProcessBatchAsync(
            candidates.Take(batchSize),
            afterId,
            hasMore,
            TranslateReviewAsync,
            cancellationToken));
    }

    private async Task<BackfillResult> ProcessBatchAsync<TEntity>(
        IEnumerable<TEntity> candidates,
        int? afterId,
        bool hasMore,
        Func<TEntity, CancellationToken, Task<bool>> translate,
        CancellationToken cancellationToken)
        where TEntity : class
    {
        var processedCount = 0;
        var translatedCount = 0;
        var failedCount = 0;
        var nextAfterId = afterId;

        foreach (var candidate in candidates)
        {
            var id = GetId(candidate);
            if (!await translate(candidate, cancellationToken))
            {
                failedCount = 1;
                hasMore = true;
                break;
            }

            processedCount++;
            translatedCount++;
            nextAfterId = id;
        }

        return new BackfillResult(processedCount, translatedCount, failedCount, nextAfterId, hasMore);
    }

    private Task<bool> TranslateHostAsync(Anfitrione host, CancellationToken cancellationToken) =>
        TranslateSingleFieldAsync(
            host.Id,
            "host",
            host.Descripcion,
            host.DescripcionEn,
            translated => _context.Anfitriones
                .Where(current => current.Id == host.Id
                    && current.Descripcion == host.Descripcion
                    && current.DescripcionEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(current => current.DescripcionEn, translated), cancellationToken),
            () => _context.Anfitriones.AsNoTracking().AnyAsync(current => current.Id == host.Id
                && current.Descripcion == host.Descripcion
                && current.DescripcionEn == null, cancellationToken),
            cancellationToken);

    private async Task<bool> TranslateExperienceAsync(Experiencia experience, CancellationToken cancellationToken)
    {
        var texts = new List<string>(2);
        var nameIndex = -1;
        var descriptionIndex = -1;
        if (experience.NombreEn is null)
        {
            nameIndex = texts.Count;
            texts.Add(experience.Nombre);
        }
        if (experience.DescripcionEn is null && !string.IsNullOrWhiteSpace(experience.Descripcion))
        {
            descriptionIndex = texts.Count;
            texts.Add(experience.Descripcion);
        }

        var translated = await TranslateAsync(experience.Id, "experience", texts, cancellationToken);
        if (translated is null) return false;

        var current = _context.Experiencias.Where(item => item.Id == experience.Id
            && item.Nombre == experience.Nombre
            && item.Descripcion == experience.Descripcion);
        if (nameIndex >= 0)
        {
            await current.Where(item => item.NombreEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.NombreEn, translated[nameIndex]), cancellationToken);
        }
        if (descriptionIndex >= 0)
        {
            await current.Where(item => item.DescripcionEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.DescripcionEn, translated[descriptionIndex]), cancellationToken);
        }

        return !await _context.Experiencias.AsNoTracking().AnyAsync(item => item.Id == experience.Id
            && (item.NombreEn == null
                || (item.Descripcion != null && item.Descripcion.Trim() != "" && item.DescripcionEn == null)), cancellationToken);
    }

    private async Task<bool> TranslateReviewAsync(Resena review, CancellationToken cancellationToken)
    {
        var texts = new List<string>(2);
        var commentIndex = -1;
        var replyIndex = -1;
        if (review.ComentarioEn is null && !string.IsNullOrWhiteSpace(review.Comentario))
        {
            commentIndex = texts.Count;
            texts.Add(review.Comentario);
        }
        if (review.RespuestaAnfitrionEn is null && !string.IsNullOrWhiteSpace(review.RespuestaAnfitrion))
        {
            replyIndex = texts.Count;
            texts.Add(review.RespuestaAnfitrion);
        }

        var translated = await TranslateAsync(review.Id, "review", texts, cancellationToken);
        if (translated is null) return false;

        var current = _context.Resenas.Where(item => item.Id == review.Id
            && item.Comentario == review.Comentario
            && item.RespuestaAnfitrion == review.RespuestaAnfitrion);
        if (commentIndex >= 0)
        {
            await current.Where(item => item.ComentarioEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.ComentarioEn, translated[commentIndex]), cancellationToken);
        }
        if (replyIndex >= 0)
        {
            await current.Where(item => item.RespuestaAnfitrionEn == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.RespuestaAnfitrionEn, translated[replyIndex]), cancellationToken);
        }

        return !await _context.Resenas.AsNoTracking().AnyAsync(item => item.Id == review.Id
            && ((item.Comentario != null && item.Comentario.Trim() != "" && item.ComentarioEn == null)
                || (item.RespuestaAnfitrion != null && item.RespuestaAnfitrion.Trim() != "" && item.RespuestaAnfitrionEn == null)),
            cancellationToken);
    }

    private async Task<bool> TranslateSingleFieldAsync(
        int id,
        string contentType,
        string? source,
        string? currentTranslation,
        Func<string, Task<int>> persist,
        Func<Task<bool>> stillPending,
        CancellationToken cancellationToken)
    {
        if (currentTranslation is null)
        {
            var translated = await TranslateAsync(id, contentType, [source!], cancellationToken);
            if (translated is null) return false;
            await persist(translated[0]);
        }

        return !await stillPending();
    }

    private async Task<IReadOnlyList<string>?> TranslateAsync(
        int id,
        string contentType,
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken)
    {
        if (texts.Count == 0) return Array.Empty<string>();
        if (texts.Any(text => string.IsNullOrWhiteSpace(text) || text.Length > 1200)) return null;

        try
        {
            var translated = await _translationService.TranslateBatchAsync(id, contentType, texts, cancellationToken);
            return translated?.Count == texts.Count ? translated : null;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                "Backfill translation failed for {ContentType} {ContentId}: {FailureCategory}",
                contentType,
                id,
                $"persistence_error_{exception.GetType().Name}");
            return null;
        }
    }

    private static int GetId<TEntity>(TEntity entity) where TEntity : class => entity switch
    {
        Anfitrione host => host.Id,
        Experiencia experience => experience.Id,
        Resena review => review.Id,
        _ => throw new InvalidOperationException($"Unsupported backfill entity {typeof(TEntity).Name}."),
    };

    private sealed record BackfillResult(
        int ProcessedCount,
        int TranslatedCount,
        int FailedCount,
        int? NextAfterId,
        bool HasMore);
}
