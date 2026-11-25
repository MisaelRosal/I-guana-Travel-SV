using System.Net.Mail;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class SoporteController : ControllerBase
{
    private static readonly string[] Estados = ["pendiente", "en_revision", "resuelto", "rechazado"];

    private readonly IguanasDbContext _context;
    private readonly INotificacionSitioService _notificaciones;
    private readonly ILogger<SoporteController> _logger;

    public SoporteController(
        IguanasDbContext context,
        INotificacionSitioService notificaciones,
        ILogger<SoporteController> logger)
    {
        _context = context;
        _notificaciones = notificaciones;
        _logger = logger;
    }

    public sealed class CrearSoporteDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Asunto { get; set; } = string.Empty;
        public string Mensaje { get; set; } = string.Empty;
    }

    public sealed class CambiarEstadoSoporteDto
    {
        public string Estado { get; set; } = "en_revision";
        public string? NotasAdmin { get; set; }
    }

    [HttpPost]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Crear(CrearSoporteDto dto)
    {
        var nombre = (dto.Nombre ?? string.Empty).Trim();
        var email = (dto.Email ?? string.Empty).Trim().ToLowerInvariant();
        var asunto = (dto.Asunto ?? string.Empty).Trim();
        var mensaje = (dto.Mensaje ?? string.Empty).Trim();

        if (nombre.Length is < 2 or > 100)
        {
            return BadRequest(new { mensaje = "El nombre debe tener entre 2 y 100 caracteres." });
        }

        if (email.Length > 150 || !MailAddress.TryCreate(email, out _))
        {
            return BadRequest(new { mensaje = "El correo no es válido." });
        }

        if (asunto.Length is < 3 or > 200)
        {
            return BadRequest(new { mensaje = "El asunto debe tener entre 3 y 200 caracteres." });
        }

        if (mensaje.Length is < 10 or > 2000)
        {
            return BadRequest(new { mensaje = "El mensaje debe tener entre 10 y 2000 caracteres." });
        }

        var soporte = new SoporteReporte
        {
            UsuarioId = User.GetSubjectId(),
            Nombre = nombre,
            Email = email,
            Asunto = asunto,
            Mensaje = mensaje,
            Estado = "pendiente",
            CreadoEn = DateTime.Now,
        };

        _context.SoporteReportes.Add(soporte);
        await _context.SaveChangesAsync();

        var admins = await _context.Usuarios
            .AsNoTracking()
            .Where(u => u.Rol == AuthConstants.AdminRole && !u.Baneado && !u.Eliminado)
            .Select(u => new { u.Id, u.Email })
            .ToListAsync();

        foreach (var admin in admins)
        {
            await _notificaciones.NotificarAsync(
                admin.Id,
                admin.Email,
                "soporte_creado",
                $"Nuevo reporte de soporte: {soporte.Asunto}",
                null);
        }

        _logger.LogInformation("Soporte report created with id {SoporteId}", soporte.Id);

        return Ok(new
        {
            id = soporte.Id,
            mensaje = "Recibimos tu reporte. Un administrador lo revisará pronto.",
        });
    }

    [HttpGet]
    [Authorize(Roles = AuthConstants.AdminRole)]
    public async Task<IActionResult> Get()
    {
        if (!await User.IsFreshAdminAsync(_context))
        {
            return Forbid();
        }

        var reportes = await _context.SoporteReportes
            .AsNoTracking()
            .OrderByDescending(s => s.CreadoEn)
            .Select(s => new
            {
                id = s.Id,
                usuarioId = s.UsuarioId,
                nombre = s.Nombre,
                email = s.Email,
                asunto = s.Asunto,
                mensaje = s.Mensaje,
                estado = s.Estado,
                creadoEn = s.CreadoEn,
                notasAdmin = s.NotasAdmin,
                resueltoEn = s.ResueltoEn,
            })
            .ToListAsync();

        return Ok(reportes);
    }

    [HttpPut("{id:int}/estado")]
    [Authorize]
    public async Task<IActionResult> CambiarEstado(int id, CambiarEstadoSoporteDto dto)
    {
        if (!await User.IsFreshAdminAsync(_context))
        {
            return Forbid();
        }

        var estado = (dto.Estado ?? string.Empty).Trim().ToLowerInvariant();
        if (!Estados.Contains(estado))
        {
            return BadRequest(new { mensaje = "Estado inválido." });
        }

        var soporte = await _context.SoporteReportes.FirstOrDefaultAsync(s => s.Id == id);
        if (soporte == null)
        {
            return NotFound(new { mensaje = "El reporte de soporte no existe." });
        }

        var sub = User.GetSubjectId();
        var finalizado = estado is "resuelto" or "rechazado";

        soporte.Estado = estado;
        soporte.NotasAdmin = string.IsNullOrWhiteSpace(dto.NotasAdmin) ? null : dto.NotasAdmin.Trim();
        soporte.ActualizadoEn = DateTime.Now;
        soporte.ResueltoPorAdminId = finalizado ? sub : null;
        soporte.ResueltoEn = finalizado ? DateTime.Now : null;
        await _context.SaveChangesAsync();

        return Ok(new { ok = true });
    }
}
