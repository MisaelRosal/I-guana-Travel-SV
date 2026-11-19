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
public class ReporteController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly IMinioStorageService _storage;
    private readonly INotificacionSitioService _notificacionesSitio;
    private readonly ILogger<ReporteController> _logger;

    public ReporteController(
        IguanasDbContext context,
        IMinioStorageService storage,
        INotificacionSitioService notificacionesSitio,
        ILogger<ReporteController> logger)
    {
        _context = context;
        _storage = storage;
        _notificacionesSitio = notificacionesSitio;
        _logger = logger;
    }

    public class CrearReporteDto
    {
        public int ReservaId { get; set; }
        public string Tipo { get; set; } = "dano";
        public string Descripcion { get; set; } = string.Empty;
    }

    public class CambiarEstadoDto
    {
        public string Estado { get; set; } = "en_revision";
        public string? NotasAdmin { get; set; }
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Crear(CrearReporteDto dto)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue) return Forbid();

        var usuario = await _context.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.Id == sub.Value);
        if (usuario == null || usuario.Rol != "anfitrion") return Forbid();

        var reserva = await _context.Reservas
            .Include(r => r.Publicacion)
                .ThenInclude(p => p!.Anfitrion)
            .FirstOrDefaultAsync(r => r.Id == dto.ReservaId);

        if (reserva == null || reserva.Publicacion == null || reserva.Publicacion.Anfitrion == null)
            return NotFound();
        if (reserva.Publicacion.Anfitrion.UsuarioId != sub.Value)
            return Forbid();
        if (reserva.Estado != "completada")
            return BadRequest(new { mensaje = "Solo puedes reportar reservas completadas." });
        if (!reserva.UsuarioId.HasValue)
            return BadRequest(new { mensaje = "La reserva no tiene un huésped registrado." });

        var existe = await _context.Reportes.AnyAsync(r => r.ReservaId == reserva.Id);
        if (existe) return Conflict(new { mensaje = "Ya existe un reporte para esta reserva." });

        var reporte = new Reporte
        {
            ReservaId = reserva.Id,
            PublicacionId = reserva.PublicacionId,
            AnfitrionId = reserva.Publicacion.Anfitrion.Id,
            UsuarioHuespedId = reserva.UsuarioId.Value,
            Tipo = string.IsNullOrWhiteSpace(dto.Tipo) ? "dano" : dto.Tipo.Trim().ToLowerInvariant(),
            Descripcion = (dto.Descripcion ?? string.Empty).Trim(),
            Estado = "pendiente",
            CreadoEn = DateTime.Now,
        };
        _context.Reportes.Add(reporte);
        await _context.SaveChangesAsync();

        // In-site copy for every admin: a pending guest report needs review.
        var admins = await _context.Usuarios
            .AsNoTracking()
            .Where(u => u.Rol == AuthConstants.AdminRole)
            .Select(u => new { u.Id, u.Email })
            .ToListAsync();
        foreach (var admin in admins)
        {
            await _notificacionesSitio.NotificarAsync(
                admin.Id,
                admin.Email,
                "reporte_creado",
                "Nuevo reporte de huésped para revisión",
                reserva.Id);
        }

        // In-site copy for the reported guest: a report was filed about their stay.
        // No guest email is sent here, so the message points to their account.
        await _notificacionesSitio.NotificarAsync(
            reserva.UsuarioId,
            reserva.EmailHuesped,
            "reporte_recibido",
            "Un anfitrión presentó un reporte sobre tu reserva. Revisa tu cuenta para más detalles.",
            reserva.Id);

        return Ok(new { id = reporte.Id, estado = reporte.Estado });
    }

    [HttpPost("{id}/evidencias")]
    [Authorize]
    [RequestSizeLimit(10_485_760)]
    public async Task<IActionResult> SubirEvidencia(int id, IFormFile file)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue) return Forbid();
        if (file == null || file.Length == 0) return BadRequest(new { mensaje = "Archivo inválido." });

        var reporte = await _context.Reportes
            .Include(r => r.Anfitrion)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (reporte == null) return NotFound();
        if (reporte.Anfitrion.UsuarioId != sub.Value) return Forbid();

        // Size mapping first: beyond the 10 MB request limit per-file uploads
        // answer 413 (M6). The attribute below caps the whole request including
        // multipart overhead.
        if (file.Length > 10_485_760)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge,
                new { mensaje = "El archivo excede el límite de 10 MB." });
        }

        string url;
        try
        {
            url = await _storage.UploadAsync(file);
        }
        catch (InvalidOperationException)
        {
            // Storage refuses bytes that are not an allowed image type; surface
            // it as 415 instead of letting it bubble up as a 500 (M6).
            return StatusCode(StatusCodes.Status415UnsupportedMediaType,
                new { mensaje = "Solo se permiten imágenes JPEG, PNG, GIF o WEBP." });
        }
        var ev = new ReporteEvidencia
        {
            ReporteId = reporte.Id,
            Url = url,
            NombreArchivo = file.FileName,
            ContentType = file.ContentType,
            CreadoEn = DateTime.Now,
        };
        _context.ReporteEvidencias.Add(ev);
        await _context.SaveChangesAsync();
        return Ok(new { id = ev.Id, url = ev.Url });
    }

    [HttpGet("mis")]
    [Authorize]
    public async Task<IActionResult> Mis(
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue) return Forbid();
        var anfitrion = await _context.Anfitriones.AsNoTracking().FirstOrDefaultAsync(a => a.UsuarioId == sub.Value);
        if (anfitrion == null) return Ok(Array.Empty<object>());

        // Opt-in pagination (M11): same optional pattern as Todos.
        IQueryable<Reporte> query = _context.Reportes
            .AsNoTracking()
            .Where(r => r.AnfitrionId == anfitrion.Id)
            .Include(r => r.UsuarioHuesped)
            .Include(r => r.Publicacion)
            .Include(r => r.Evidencias)
            .OrderByDescending(r => r.CreadoEn);

        if (pageSize != null)
        {
            var tamano = Math.Clamp(pageSize.Value, 1, 300);
            var salto = Math.Max(page ?? 1, 1);
            query = query.Skip((salto - 1) * tamano).Take(tamano);
        }

        var reportes = await query
            .Select(r => new
            {
                id = r.Id,
                reservaId = r.ReservaId,
                publicacionId = r.PublicacionId,
                publicacionTitulo = r.Publicacion.Titulo,
                huespedNombre = r.UsuarioHuesped.Nombre + " " + r.UsuarioHuesped.Apellido,
                huespedEmail = r.UsuarioHuesped.Email,
                tipo = r.Tipo,
                descripcion = r.Descripcion,
                estado = r.Estado,
                creadoEn = r.CreadoEn,
                notasAdmin = r.NotasAdmin,
                resueltoEn = r.ResueltoEn,
                evidencias = r.Evidencias.Select(e => new { id = e.Id, url = e.Url })
            })
            .ToListAsync();

        return Ok(reportes);
    }

    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Todos(
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        // Opt-in pagination (M11): without pageSize the list stays full for the
        // current admin panel; when given, it is clamped defensively.
        IQueryable<Reporte> query = _context.Reportes
            .AsNoTracking()
            .Include(r => r.UsuarioHuesped)
            .Include(r => r.Publicacion)
            .Include(r => r.Anfitrion)
            .Include(r => r.Reserva)
            .Include(r => r.Evidencias)
            .OrderByDescending(r => r.CreadoEn);

        if (pageSize != null)
        {
            var tamano = Math.Clamp(pageSize.Value, 1, 300);
            var salto = Math.Max(page ?? 1, 1);
            query = query.Skip((salto - 1) * tamano).Take(tamano);
        }

        var reportes = await query
            .Select(r => new
            {
                id = r.Id,
                reservaId = r.ReservaId,
                publicacionId = r.PublicacionId,
                publicacionTitulo = r.Publicacion.Titulo,
                anfitrionNombre = r.Anfitrion.Nombre,
                huespedNombre = r.UsuarioHuesped.Nombre + " " + r.UsuarioHuesped.Apellido,
                huespedEmail = r.UsuarioHuesped.Email,
                tipo = r.Tipo,
                descripcion = r.Descripcion,
                estado = r.Estado,
                creadoEn = r.CreadoEn,
                notasAdmin = r.NotasAdmin,
                resueltoEn = r.ResueltoEn,
                fechaInicio = r.Reserva.FechaInicio,
                fechaFin = r.Reserva.FechaFin,
                evidencias = r.Evidencias.Select(e => new { id = e.Id, url = e.Url })
            })
            .ToListAsync();

        return Ok(reportes);
    }

    [HttpPut("{id}/estado")]
    [Authorize]
    public async Task<IActionResult> CambiarEstado(int id, CambiarEstadoDto dto)
    {
        if (!await User.IsFreshAdminAsync(_context))
        {
            return Forbid();
        }

        var sub = User.GetSubjectId();
        if (!sub.HasValue) return Forbid();

        var reporte = await _context.Reportes.FirstOrDefaultAsync(r => r.Id == id);
        if (reporte == null) return NotFound();

        var estados = new[] { "pendiente", "en_revision", "resuelto", "rechazado" };
        if (!estados.Contains(dto.Estado)) return BadRequest(new { mensaje = "Estado inválido." });

        reporte.Estado = dto.Estado;
        reporte.NotasAdmin = string.IsNullOrWhiteSpace(dto.NotasAdmin) ? null : dto.NotasAdmin.Trim();
        reporte.ResueltoPorAdminId = sub.Value;
        reporte.ResueltoEn = DateTime.Now;
        await _context.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}
