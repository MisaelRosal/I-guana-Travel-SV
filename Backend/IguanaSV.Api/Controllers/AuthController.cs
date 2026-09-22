using System.Security.Cryptography;
using IguanaSV.Api.Auth;
using IguanaSV.Api.DTOs;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly JwtTokenService _tokens;
    private readonly JwtOptions _jwtOptions;
    private readonly IHostEnvironment _environment;

    public AuthController(
        IguanasDbContext context,
        JwtTokenService tokens,
        JwtOptions jwtOptions,
        IHostEnvironment environment)
    {
        _context = context;
        _tokens = tokens;
        _jwtOptions = jwtOptions;
        _environment = environment;
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

        // Registration starts a session exactly like login: issue the auth cookie
        // and the CSRF cookie; the JWT never appears in the response body.
        IssueSession(usuario);

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

        IssueSession(usuario);

        return Ok(ToResponse(usuario));
    }

    /// <summary>
    /// Session rehydration endpoint. Returns the caller's identity derived from the
    /// auth cookie, with the role taken fresh from the database (a role upgrade
    /// applies on the next /me even if the token still carries the old claim).
    /// [Authorize] means no valid token yields 401 automatically.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UsuarioResponse>> Me()
    {
        var userId = User.GetSubjectId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var usuario = await _context.Usuarios.FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (usuario is null)
        {
            // Token is valid but the account no longer exists.
            return Unauthorized();
        }

        return Ok(ToResponse(usuario));
    }

    /// <summary>
    /// Clears both session cookies so subsequent protected calls are anonymous.
    /// Safe to call even when not authenticated; it always expires the cookies.
    /// </summary>
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        var baseOptions = new CookieOptions
        {
            Path = "/",
            SameSite = SameSiteMode.Lax,
            Secure = _environment.IsProduction(),
            Expires = DateTimeOffset.UnixEpoch,
        };

        Response.Cookies.Delete(AuthConstants.AuthCookieName, baseOptions);
        Response.Cookies.Delete(AuthConstants.CsrfCookieName, baseOptions);
        return NoContent();
    }

    /// <summary>
    /// Sign a fresh JWT and write the HttpOnly auth cookie plus the readable
    /// double-submit CSRF cookie. Body of the response is unaffected.
    /// </summary>
    private void IssueSession(Usuario usuario)
    {
        var token = _tokens.CreateToken(usuario);
        var expires = DateTimeOffset.UtcNow.AddMinutes(_jwtOptions.ExpiresInMinutes);
        var isProduction = _environment.IsProduction();

        Response.Cookies.Append(AuthConstants.AuthCookieName, token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = isProduction,
            Path = "/",
            Expires = expires,
        });

        Response.Cookies.Append(AuthConstants.CsrfCookieName, GenerateCsrfToken(), new CookieOptions
        {
            // Intentionally NOT HttpOnly: the SPA must read it and echo it back
            // in the X-CSRF-Token header. Cross-site code cannot read our cookie.
            HttpOnly = false,
            SameSite = SameSiteMode.Lax,
            Secure = isProduction,
            Path = "/",
            Expires = expires,
        });
    }

    private static string GenerateCsrfToken()
    {
        // Hex keeps the value URL/cookie-safe with no encoding surprises.
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
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
            Rol = u.Rol,
            CreatedAt = u.CreatedAt,
        };
    }
}
