using PublicacioneEntity = IguanaSV.Api.Entities.Publicacione;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

/// <summary>
/// Saved publications ("favoritas") for the signed-in user. Every action is
/// scoped to the caller's <c>sub</c> claim, so one user can never see or touch
/// another user's saved list. Add/remove are idempotent by design: the composite
/// primary key (usuario_id, publicacion_id) is the arbiter, which is also what
/// lets the UI double-click without a duplicate row or a spurious 409.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FavoritoController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public FavoritoController(IguanasDbContext context)
    {
        _context = context;
    }

    // GET: /api/Favorito/ids — the saved id set for the catalog/detail heart
    // buttons, cheap to read and enough to paint their pressed state.
    [HttpGet("ids")]
    public async Task<ActionResult<IEnumerable<int>>> GetIds()
    {
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        var ids = await _context.PublicacionesFavoritas
            .AsNoTracking()
            .Where(f => f.UsuarioId == sub.Value)
            .Select(f => f.PublicacionId)
            .ToListAsync();

        return Ok(ids);
    }

    // GET: /api/Favorito/mios — full publication rows so the saved list reuses
    // the very same projection (and `mapearPublicacion` mapping) as the catalog.
    [HttpGet("mios")]
    public async Task<ActionResult<IEnumerable<PublicacioneEntity>>> GetMios(
        [FromQuery] string? contentLocale = null)
    {
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        if (!PublicacionContentLocale.TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var favoritos = await _context.PublicacionesFavoritas
            .AsNoTracking()
            .Where(f => f.UsuarioId == sub.Value)
            .OrderByDescending(f => f.CreadoEn)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.Anfitrion)
                    .ThenInclude(a => a.Municipio)
                        .ThenInclude(m => m.Departamento)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.Municipio)
                    .ThenInclude(m => m.Departamento)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.Categoria)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.Experiencia)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.Horarios)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.ImagenesPublicacions)
            .Include(f => f.Publicacion)
                .ThenInclude(p => p.PublicacionAmenidads)
                    .ThenInclude(pa => pa.Amenidad)
            .ToListAsync();

        var publicaciones = favoritos.Select(f => f.Publicacion).ToList();
        PublicacionContentLocale.ApplyContentLocale(publicaciones, locale);
        return Ok(publicaciones);
    }

    // POST: /api/Favorito/{publicacionId} — idempotent save: already saved or a
    // fresh save both answer 200 with the resulting state; an unknown publication
    // answers 404 so the caller learns the id no longer exists.
    [HttpPost("{publicacionId:int}")]
    public async Task<ActionResult> Add(int publicacionId)
    {
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        var publicacionExiste = await _context.Publicaciones
            .AsNoTracking()
            .AnyAsync(p => p.Id == publicacionId);
        if (!publicacionExiste)
        {
            return NotFound(new { mensaje = "La publicación no existe." });
        }

        if (await _context.PublicacionesFavoritas
                .AsNoTracking()
                .AnyAsync(f => f.UsuarioId == sub.Value && f.PublicacionId == publicacionId))
        {
            return Ok(new { guardado = true });
        }

        _context.PublicacionesFavoritas.Add(new PublicacionFavorita
        {
            UsuarioId = sub.Value,
            PublicacionId = publicacionId,
        });

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Two saves raced on the same pair: the composite key rejected the
            // loser, and the desired end state (the row exists) already holds.
            var pendiente = _context.PublicacionesFavoritas.Local
                .FirstOrDefault(f => f.UsuarioId == sub.Value && f.PublicacionId == publicacionId);
            if (pendiente is not null)
            {
                _context.Entry(pendiente).State = EntityState.Detached;
            }

            if (!await _context.PublicacionesFavoritas
                    .AsNoTracking()
                    .AnyAsync(f => f.UsuarioId == sub.Value && f.PublicacionId == publicacionId))
            {
                throw;
            }
        }

        return Ok(new { guardado = true });
    }

    // DELETE: /api/Favorito/{publicacionId} — idempotent unsave: missing rows are
    // already in the desired state, so every authenticated caller gets 204.
    [HttpDelete("{publicacionId:int}")]
    public async Task<ActionResult> Remove(int publicacionId)
    {
        var sub = User.GetSubjectId();
        if (sub is null)
        {
            return Unauthorized();
        }

        var favorito = await _context.PublicacionesFavoritas
            .FindAsync(sub.Value, publicacionId);

        if (favorito is not null)
        {
            _context.PublicacionesFavoritas.Remove(favorito);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                // Another request removed the same row first — same end state.
            }
        }

        return NoContent();
    }
}
