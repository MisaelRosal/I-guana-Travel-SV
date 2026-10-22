using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

/// <summary>
/// Traveler↔host chat. One persistent conversation per (traveler, host) pair,
/// resolved exclusively from the token subject — client bodies may name a
/// traveler id, it is ignored (spec ACC3). The Resena vertical slice is the
/// precedent: foreign conversation ids answer 404 (existence is never leaked),
/// insert races surface as 409 with a Spanish <c>mensaje</c> body, and every
/// endpoint sits behind the existing cookie/CSRF auth surface. Unread state is
/// derived from the per-side last-read stamps; message pages are keyset over
/// <c>(creado_en, id)</c> with a fixed size of 50. v1 has no rate limiter and
/// no translation — stored text is served verbatim.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    /// <summary>Spec-pinned page size for the keyset history.</summary>
    private const int TamanoPagina = 50;

    private readonly IguanasDbContext _context;

    public ChatController(IguanasDbContext context) => _context = context;

    // Open-or-get for the caller's pair with the given host. The host side is
    // resolved server-side through anfitriones.usuario_id; a host row with no
    // linked account (or none at all) fails closed with 404 and no row.
    [HttpGet("anfitrion/{anfitrionId:int}")]
    [Authorize]
    public async Task<IActionResult> GetOAbrir(int anfitrionId)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var anfitrion = await _context.Anfitriones
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == anfitrionId);
        if (anfitrion is null || anfitrion.UsuarioId is null)
        {
            return NotFound(new { mensaje = "El anfitrión no está disponible para mensajes." });
        }

        if (anfitrion.UsuarioId == sub.Value)
        {
            return BadRequest(new { mensaje = "No se puede conversar con uno mismo." });
        }

        var existente = await _context.Conversaciones
            .FirstOrDefaultAsync(c => c.ViajeroUsuarioId == sub.Value && c.AnfitrionId == anfitrionId);
        if (existente is not null)
        {
            return Ok(ProyectarConversacion(existente));
        }

        var conversacion = new Conversacione
        {
            ViajeroUsuarioId = sub.Value,
            AnfitrionId = anfitrionId,
            CreadoEn = DateTime.Now,
        };
        _context.Conversaciones.Add(conversacion);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Lost the race against a concurrent open for the same pair
            // (unique conversaciones_viajero_usuario_id_anfitrion_id_key).
            // The next request returns the winner's row (Resena precedent).
            return Conflict(new { mensaje = "La conversación se está creando en paralelo. Reintentá." });
        }

        return Ok(ProyectarConversacion(conversacion));
    }

    // Unread badge total for the Header poll: sum of per-conversation unread
    // counts against both of the caller's possible sides (traveler + host).
    [HttpGet("no-leidos")]
    [Authorize]
    public async Task<IActionResult> GetNoLeidos()
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var hilos = await BuscarHilosAsync(sub.Value);
        return Ok(new { total = hilos.Sum(h => h.NoLeidos) });
    }

    // Inbox: role-filtered rows for the caller's own participation only —
    // an admin sees here exactly what any other user sees: their own threads.
    [HttpGet("mias")]
    [Authorize]
    public async Task<IActionResult> GetMisConversaciones()
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        return Ok(await BuscarHilosAsync(sub.Value));
    }

    // Direct fetch of a pair conversation. Foreign ids are 404, never 403.
    [HttpGet("{id:int}")]
    [Authorize]
    public async Task<IActionResult> GetConversacion(int id)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var conversacion = await CargarConversacionParticipanteAsync(id, sub.Value);
        if (conversacion is null)
        {
            return NotFoundConversacion();
        }

        return Ok(ProyectarConversacion(conversacion));
    }

    // Keyset history page, newest-first. `before_creado_en` + `before_id` are
    // both-or-neither; the page size is fixed at 50 server-side (spec pin).
    // Participants only — a foreign conversation id is 404 (spec ACC1/ACC2).
    [HttpGet("{id:int}/mensajes")]
    [Authorize]
    public async Task<IActionResult> GetMensajes(
        int id,
        [FromQuery(Name = "before_creado_en")] DateTime? antesDe,
        [FromQuery(Name = "before_id")] int? antesDeId,
        [FromQuery] string? contentLocale = null)
    {
        if (!TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        if (await CargarConversacionParticipanteAsync(id, sub.Value) is null)
        {
            return NotFoundConversacion();
        }

        if ((antesDe is null) != (antesDeId is null))
        {
            return BadRequest(new { mensaje = "before_creado_en y before_id deben llegar juntos." });
        }

        var query = _context.Mensajes.AsNoTracking().Where(m => m.ConversacionId == id);
        if (antesDe is not null && antesDeId is not null)
        {
            var corte = antesDe.Value;
            var limiteId = antesDeId.Value;
            query = query.Where(m => m.CreadoEn < corte || (m.CreadoEn == corte && m.Id < limiteId));
        }

        var items = await query
            .OrderByDescending(m => m.CreadoEn)
            .ThenByDescending(m => m.Id)
            .Take(TamanoPagina)
            .Select(m => new MensajeItemDto
            {
                Id = m.Id,
                ConversacionId = m.ConversacionId,
                EmisorUsuarioId = m.EmisorUsuarioId,
                Mensaje = m.Texto,
                PublicacionId = m.PublicacionId,
                CreadoEn = m.CreadoEn,
                EmisorNombre = m.EmisorUsuario!.Nombre + " " + m.EmisorUsuario.Apellido,
                // The host of THIS thread shows their host photo; anyone else
                // (the traveler) has no profile picture stored on usuarios.
                EmisorFoto = m.Conversacion!.Anfitrion!.UsuarioId == m.EmisorUsuarioId
                    ? m.Conversacion.Anfitrion.FotoPerfil
                    : null,
                Publicacion = m.Publicacion == null
                    ? null
                    : new PublicacionContextoDto
                    {
                        Id = m.Publicacion.Id,
                        Titulo = locale == "en"
                            && m.Publicacion.TituloEn != null
                            && m.Publicacion.TituloEn.Trim() != ""
                                ? m.Publicacion.TituloEn
                                : m.Publicacion.Titulo,
                        Precio = m.Publicacion.PrecioPorNoche,
                    },
            })
            .ToListAsync();

        return Ok(new PaginaMensajesDto
        {
            Mensajes = items,
            // A full page MAY have older rows: hand back the oldest row of this
            // page as the cursor. A short page is the end of the thread.
            Cursor = items.Count == TamanoPagina
                ? new CursorKeysetDto { AntesDe = items[^1].CreadoEn, AntesDeId = items[^1].Id }
                : null,
        });
    }

    // Send: persisted verbatim (trim only), 201 with the stored row. The
    // conversation preview stamps ride the same SaveChanges (design: inbox
    // denormalization). Non-participants never get here: foreign id → 404.
    [HttpPost("{id:int}/mensajes")]
    [Authorize]
    public async Task<IActionResult> PostMensaje(
        int id,
        CrearMensajeDto dto,
        [FromQuery] string? contentLocale = null)
    {
        // A malformed locale must not poison the write's projection; the
        // message itself is still validated by CreateMensajeValidator (400).
        if (!TryNormalizeContentLocale(contentLocale, out var locale))
        {
            return BadRequest(new { mensaje = "contentLocale debe ser 'es' o 'en'." });
        }

        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var conversacion = await CargarConversacionParticipanteAsync(id, sub.Value);
        if (conversacion is null)
        {
            return NotFoundConversacion();
        }

        if (conversacion.ViajeroUsuarioId == conversacion.Anfitrion.UsuarioId)
        {
            return BadRequest(new { mensaje = "No se puede conversar con uno mismo." });
        }

        var texto = (dto.Mensaje ?? string.Empty).Trim();
        var creadoEn = DateTime.Now;
        var mensaje = new Mensaje
        {
            ConversacionId = conversacion.Id,
            EmisorUsuarioId = sub.Value,
            PublicacionId = dto.PublicacionId,
            Texto = texto,
            CreadoEn = creadoEn,
        };
        conversacion.UltimoMensajeEn = creadoEn;
        conversacion.UltimoMensajeTexto = texto;
        _context.Mensajes.Add(mensaje);

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Belt-and-suspenders: unknown publicacion_id (FK) or a text that
            // slipped past the validator (DB check). Nothing was persisted.
            return BadRequest(new { mensaje = "No se pudo enviar el mensaje." });
        }

        var item = await _context.Mensajes
            .AsNoTracking()
            .Where(m => m.Id == mensaje.Id)
            .Select(m => new MensajeItemDto
            {
                Id = m.Id,
                ConversacionId = m.ConversacionId,
                EmisorUsuarioId = m.EmisorUsuarioId,
                Mensaje = m.Texto,
                PublicacionId = m.PublicacionId,
                CreadoEn = m.CreadoEn,
                EmisorNombre = m.EmisorUsuario!.Nombre + " " + m.EmisorUsuario.Apellido,
                EmisorFoto = m.Conversacion!.Anfitrion!.UsuarioId == m.EmisorUsuarioId
                    ? m.Conversacion.Anfitrion.FotoPerfil
                    : null,
                Publicacion = m.Publicacion == null
                    ? null
                    : new PublicacionContextoDto
                    {
                        Id = m.Publicacion.Id,
                        Titulo = locale == "en"
                            && m.Publicacion.TituloEn != null
                            && m.Publicacion.TituloEn.Trim() != ""
                                ? m.Publicacion.TituloEn
                                : m.Publicacion.Titulo,
                        Precio = m.Publicacion.PrecioPorNoche,
                    },
            })
            .FirstAsync();

        // 201 with the persisted body; no Location header (no GET-by-message).
        return StatusCode(StatusCodes.Status201Created, item);
    }

    // Read-mark: advances ONLY the caller's own ultimo_leido_*_en to the
    // conversation's newest message stamp (DB clock, no app skew). Empty
    // conversations are a no-op. Later messages stay unread by construction.
    [HttpPut("{id:int}/leido")]
    [Authorize]
    public async Task<IActionResult> PutLeido(int id)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var conversacion = await CargarConversacionParticipanteAsync(id, sub.Value);
        if (conversacion is null)
        {
            return NotFoundConversacion();
        }

        var maximo = await _context.Mensajes
            .Where(m => m.ConversacionId == id)
            .MaxAsync(m => (DateTime?)m.CreadoEn);

        if (maximo.HasValue)
        {
            if (conversacion.ViajeroUsuarioId == sub.Value)
            {
                conversacion.UltimoLeidoViajeroEn = maximo;
            }
            else
            {
                conversacion.UltimoLeidoAnfitrionEn = maximo;
            }

            await _context.SaveChangesAsync();
        }

        return Ok(new { id = conversacion.Id, ultimo_leido_en = maximo });
    }

    /// <summary>
    /// The conversation for <paramref name="id"/> when the caller is one of its
    /// two participants (traveler by subject, host by anfitriones.usuario_id).
    /// Admins get no extra visibility: participation is the only grant.
    /// </summary>
    private async Task<Conversacione?> CargarConversacionParticipanteAsync(int id, int sub)
    {
        var conversacion = await _context.Conversaciones
            .Include(c => c.Anfitrion)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (conversacion is null)
        {
            return null;
        }

        var esViajero = conversacion.ViajeroUsuarioId == sub;
        var esAnfitrion = conversacion.Anfitrion?.UsuarioId == sub;
        return esViajero || esAnfitrion ? conversacion : null;
    }

    private static ConversacionDto ProyectarConversacion(Conversacione conversacion) => new()
    {
        Id = conversacion.Id,
        ViajeroUsuarioId = conversacion.ViajeroUsuarioId,
        AnfitrionId = conversacion.AnfitrionId,
        CreadoEn = conversacion.CreadoEn,
    };

    /// <summary>
    /// Inbox rows for both of the caller's sides. The unread count compares the
    /// other side's messages against the caller's own last-read stamp (null
    /// means "nothing read yet" — every foreign message counts).
    /// </summary>
    private async Task<List<HiloChatDto>> BuscarHilosAsync(int sub)
    {
        var comoViajero = await _context.Conversaciones
            .AsNoTracking()
            .Where(c => c.ViajeroUsuarioId == sub)
            .Select(c => new HiloChatDto
            {
                ConversacionId = c.Id,
                ContraNombre = c.Anfitrion!.Nombre,
                ContraFoto = c.Anfitrion.FotoPerfil,
                UltimoMensajeTexto = c.UltimoMensajeTexto,
                UltimoMensajeEn = c.UltimoMensajeEn,
                NoLeidos = c.Mensajes.Count(m =>
                    m.EmisorUsuarioId != sub
                    && (c.UltimoLeidoViajeroEn == null || m.CreadoEn > c.UltimoLeidoViajeroEn)),
            })
            .ToListAsync();

        // ViajeroUsuarioId != sub skips the (self-thread) rows already returned
        // above, so a user who chats with their own host record sees one row.
        var comoAnfitrion = await _context.Conversaciones
            .AsNoTracking()
            .Where(c => c.Anfitrion!.UsuarioId == sub && c.ViajeroUsuarioId != sub)
            .Select(c => new HiloChatDto
            {
                ConversacionId = c.Id,
                ContraNombre = c.ViajeroUsuario!.Nombre + " " + c.ViajeroUsuario.Apellido,
                ContraFoto = null,
                UltimoMensajeTexto = c.UltimoMensajeTexto,
                UltimoMensajeEn = c.UltimoMensajeEn,
                NoLeidos = c.Mensajes.Count(m =>
                    m.EmisorUsuarioId != sub
                    && (c.UltimoLeidoAnfitrionEn == null || m.CreadoEn > c.UltimoLeidoAnfitrionEn)),
            })
            .ToListAsync();

        return comoViajero
            .Concat(comoAnfitrion)
            .OrderByDescending(h => h.UltimoMensajeEn ?? DateTime.MinValue)
            .ToList();
    }

    private IActionResult NotFoundConversacion() =>
        NotFound(new { mensaje = "Conversación no encontrada." });

    private static bool TryNormalizeContentLocale(string? contentLocale, out string locale)
    {
        locale = string.IsNullOrWhiteSpace(contentLocale)
            ? "es"
            : contentLocale.Trim().ToLowerInvariant();
        return locale is "es" or "en";
    }
}
