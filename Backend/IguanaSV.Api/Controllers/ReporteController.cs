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
    private readonly ILogger<ReporteController> _logger;

    public ReporteController(IguanasDbContext context, IMinioStorageService storage, ILogger<ReporteController> logger)
    {
        _context = context;
        _storage = storage;
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

        var url = await _storage.UploadAsync(file);
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
    public async Task<IActionResult> Mis()
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue) return Forbid();
        var anfitrion = await _context.Anfitriones.AsNoTracking().FirstOrDefaultAsync(a => a.UsuarioId == sub.Value);
        if (anfitrion == null) return Ok(Array.Empty<object>());

        var reportes = await _context.Reportes
            .AsNoTracking()
            .Where(r => r.AnfitrionId == anfitrion.Id)
            .Include(r => r.UsuarioHuesped)
            .Include(r => r.Publicacion)
            .Include(r => r.Evidencias)
            .OrderByDescending(r => r.CreadoEn)
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
    public async Task<IActionResult> Todos()
    {
        var reportes = await _context.Reportes
            .AsNoTracking()
            .Include(r => r.UsuarioHuesped)
            .Include(r => r.Publicacion)
            .Include(r => r.Anfitrion)
            .Include(r => r.Reserva)
            .Include(r => r.Evidencias)
            .OrderByDescending(r => r.CreadoEn)
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
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> CambiarEstado(int id, CambiarEstadoDto dto)
    {
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
