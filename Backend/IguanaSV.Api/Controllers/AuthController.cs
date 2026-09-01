using IguanaSV.Api.DTOs;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IguanasDbContext _context;

    public AuthController(IguanasDbContext context)
    {
        _context = context;
    }

    [HttpPost("register")]
    public async Task<ActionResult<UsuarioResponse>> Register(RegistroRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Nombre) ||
            string.IsNullOrWhiteSpace(request.Apellido) ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { mensaje = "Todos los campos son obligatorios." });
        }

        var email = request.Email.Trim().ToLowerInvariant();

        var existe = await _context.Usuarios.AnyAsync(u => u.Email == email);
        if (existe)
        {
            return Conflict(new { mensaje = "Ya existe una cuenta registrada con este correo." });
        }

        var usuario = new Usuario
        {
            Nombre = request.Nombre.Trim(),
            Apellido = request.Apellido.Trim(),
            Telefono = request.Telefono?.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
        };

        _context.Usuarios.Add(usuario);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(Register), new { id = usuario.Id }, ToResponse(usuario));
    }

    [HttpPost("login")]
    public async Task<ActionResult<UsuarioResponse>> Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { mensaje = "Correo y contraseña son obligatorios." });
        }

        var email = request.Email.Trim().ToLowerInvariant();

        var usuario = await _context.Usuarios.FirstOrDefaultAsync(u => u.Email == email);
        if (usuario == null || !BCrypt.Net.BCrypt.Verify(request.Password, usuario.PasswordHash))
        {
            return Unauthorized(new { mensaje = "Correo o contraseña incorrectos." });
        }

        return Ok(ToResponse(usuario));
    }

    private static UsuarioResponse ToResponse(Usuario u)
    {
        return new UsuarioResponse
        {
            Id = u.Id,
            Nombre = u.Nombre,
            Apellido = u.Apellido,
            Telefono = u.Telefono,
            Email = u.Email,
            CreatedAt = u.CreatedAt,
        };
    }
}
