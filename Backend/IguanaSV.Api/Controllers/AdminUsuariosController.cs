using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/admin/usuarios")]
[Authorize(Roles = AuthConstants.AdminRole)]
public sealed class AdminUsuariosController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly ILogger<AdminUsuariosController> _logger;

    public AdminUsuariosController(IguanasDbContext context, ILogger<AdminUsuariosController> logger)
    {
        _context = context;
        _logger = logger;
    }

    public sealed class BaneoUsuarioDto
    {
        public bool Baneado { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? q)
    {
        if (!await User.IsFreshAdminAsync(_context))
        {
            return Forbid();
        }

        var query = _context.Usuarios
            .AsNoTracking()
            .Where(u => u.Rol == "usuario" && !u.Eliminado);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q.Trim()}%";
            query = query.Where(u =>
                EF.Functions.ILike(u.Nombre, term)
                || EF.Functions.ILike(u.Apellido, term)
                || EF.Functions.ILike(u.Email, term));
        }

        var usuarios = await query
            .OrderByDescending(u => u.Id)
            .Select(u => new
            {
                id = u.Id,
                nombre = u.Nombre,
                apellido = u.Apellido,
                email = u.Email,
                telefono = u.Telefono,
                emailVerificado = u.EmailVerificado,
                baneado = u.Baneado,
                baneadoEn = u.BaneadoEn,
                createdAt = u.CreatedAt,
            })
            .ToListAsync();

        return Ok(usuarios);
    }

    [HttpPut("{id:int}/baneo")]
    public async Task<IActionResult> CambiarBaneo(int id, BaneoUsuarioDto dto)
    {
        if (!await User.IsFreshAdminAsync(_context))
        {
            return Forbid();
        }

        var usuario = await _context.Usuarios.FirstOrDefaultAsync(u => u.Id == id);

        if (usuario == null || usuario.Eliminado)
        {
            return NotFound(new { mensaje = "La cuenta no existe." });
        }

        if (usuario.Rol != "usuario")
        {
            return BadRequest(new { mensaje = "Solo se pueden administrar cuentas de usuario normales." });
        }

        usuario.Baneado = dto.Baneado;
        usuario.BaneadoEn = dto.Baneado ? DateTime.Now : null;
        usuario.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Admin {AdminId} changed ban={Baneado} for user {UserId}",
            User.GetSubjectId(),
            dto.Baneado,
            usuario.Id);

        return Ok(new { id = usuario.Id, baneado = usuario.Baneado });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id)
    {
        if (!await User.IsFreshAdminAsync(_context))
        {
            return Forbid();
        }

        var usuario = await _context.Usuarios.FirstOrDefaultAsync(u => u.Id == id);

        if (usuario == null || usuario.Eliminado)
        {
            return NotFound(new { mensaje = "La cuenta no existe." });
        }

        if (usuario.Rol != "usuario")
        {
            return BadRequest(new { mensaje = "Solo se pueden eliminar cuentas de usuario normales." });
        }

        usuario.Nombre = "Cuenta";
        usuario.Apellido = "Eliminada";
        usuario.Email = $"eliminado+{usuario.Id}@cuenta-eliminada.local";
        usuario.Telefono = null;
        usuario.PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString("N"));
        usuario.EmailVerificado = false;
        usuario.Baneado = true;
        usuario.BaneadoEn = DateTime.Now;
        usuario.Eliminado = true;
        usuario.EliminadoEn = DateTime.Now;
        usuario.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        _logger.LogWarning(
            "Admin {AdminId} soft-deleted user {UserId}",
            User.GetSubjectId(),
            id);

        return NoContent();
    }
}
