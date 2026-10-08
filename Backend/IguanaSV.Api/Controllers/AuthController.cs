using System.Security.Cryptography;
using IguanaSV.Api.Auth;
using IguanaSV.Api.DTOs;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IguanasDbContext _context;
    private readonly JwtTokenService _tokens;
    private readonly JwtOptions _jwtOptions;
    private readonly IHostEnvironment _environment;
    private readonly VerificationCodeService _codigos;
    private readonly IEmailNotificationService _notificaciones;
    private readonly EmailOptions _emailOptions;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IguanasDbContext context,
        JwtTokenService tokens,
        JwtOptions jwtOptions,
        IHostEnvironment environment,
        VerificationCodeService codigos,
        IEmailNotificationService notificaciones,
        IOptions<EmailOptions> emailOptions,
        ILogger<AuthController> logger)
    {
        _context = context;
        _tokens = tokens;
        _jwtOptions = jwtOptions;
        _environment = environment;
        _codigos = codigos;
        _notificaciones = notificaciones;
        _emailOptions = emailOptions.Value;
        _logger = logger;
    }

    [HttpPost("register")]
    public async Task<ActionResult<RegistroResponseDto>> Register(RegistroRequest request)
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
            EmailVerificado = _codigos.VerificacionDeshabilitada,
        };

        _context.Usuarios.Add(usuario);
        await _context.SaveChangesAsync();

        if (usuario.EmailVerificado)
        {
            // Verification is off: registration completes exactly as before and
            // starts the session immediately.
            IssueSession(usuario);
            return CreatedAtAction(nameof(Register), new { id = usuario.Id }, new RegistroResponseDto
            {
                Id = usuario.Id,
                Email = usuario.Email,
                VerificacionRequerida = false,
                Mensaje = "Cuenta creada con éxito.",
            });
        }

        // The account exists but is dormant until the emailed code is entered.
        var codigo = await _codigos.GenerarAsync(usuario.Id);
        var enviado = await _notificaciones.VerificacionDeCorreoAsync(usuario.Email, usuario.Nombre, codigo);

        if (!enviado)
        {
            // Delivery failed (no email provider configured, network…).
            // Never trap the user behind a mailbox we could not reach: activate
            // the account and tell them plainly instead of leaving it locked.
            usuario.EmailVerificado = true;
            await _context.SaveChangesAsync();
            _logger.LogWarning(
                "No se pudo enviar el correo de verificación a {Email}; la cuenta {Id} se activó sin verificar.",
                usuario.Email, usuario.Id);

            return CreatedAtAction(nameof(Register), new { id = usuario.Id }, new RegistroResponseDto
            {
                Id = usuario.Id,
                Email = usuario.Email,
                VerificacionRequerida = false,
                Mensaje = "Cuenta creada, pero no se pudo enviar el correo de verificación. " +
                          "Revisá la configuración de correo o probá de nuevo más tarde.",
            });
        }

        return CreatedAtAction(nameof(Register), new { id = usuario.Id }, new RegistroResponseDto
        {
            Id = usuario.Id,
            Email = usuario.Email,
            VerificacionRequerida = true,
            Mensaje = $"Te enviamos un código de verificación a {usuario.Email}. " +
                      $"Caduca en {_emailOptions.VerificacionExpiraMinutos} minutos.",
        });
    }

    /// <summary>
    /// Completes a registration held for email verification. Issues the session
    /// (same cookies as login) only when the newest unused, unexpired code for
    /// that address matches.
    /// </summary>
    [HttpPost("verificar-email")]
    public async Task<ActionResult<UsuarioResponse>> VerificarEmail(VerificarEmailRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Codigo))
        {
            return BadRequest(new { mensaje = "El correo y el código son obligatorios." });
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var usuario = await _context.Usuarios.FirstOrDefaultAsync(u => u.Email == email);

        // Same message for "no such account" and "wrong code": never let a
        // caller use this endpoint to enumerate which addresses are registered.
        if (usuario == null)
        {
            return BadRequest(new { mensaje = "El código ingresado no es válido." });
        }

        if (usuario.EmailVerificado)
        {
            // Already active (e.g. re-verified from a second tab): just sign in.
            IssueSession(usuario);
            return Ok(ToResponse(usuario));
        }

        var valido = await _codigos.VerificarAsync(usuario.Id, request.Codigo);
        if (!valido)
        {
            return BadRequest(new { mensaje = "El código ingresado no es válido o ya expiró." });
        }

        usuario.EmailVerificado = true;
        usuario.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        IssueSession(usuario);
        await _notificaciones.BienvenidaAsync(usuario.Email, usuario.Nombre);

        return Ok(ToResponse(usuario));
    }

    /// <summary>
    /// Supersedes the outstanding code with a fresh one. Rate-limited per user
    /// so a runaway client cannot hammer the mail provider.
    /// </summary>
    [HttpPost("reenviar-verificacion")]
    public async Task<IActionResult> ReenviarVerificacion(ReenviarVerificacionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new { mensaje = "El correo es obligatorio." });
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var usuario = await _context.Usuarios.FirstOrDefaultAsync(u => u.Email == email);

        // Do not reveal whether the address exists.
        if (usuario == null || usuario.EmailVerificado)
        {
            return Ok(new { mensaje = "Si existe una cuenta pendiente de verificación, te enviamos un correo nuevo." });
        }

        var desde = DateTime.Now.AddHours(-1);
        var reenvios = await _context.VerificacionesEmail
            .CountAsync(v => v.UsuarioId == usuario.Id && v.CreadoEn >= desde);
        if (reenvios >= Math.Max(1, _emailOptions.VerificacionMaxReenviosHora))
        {
            return StatusCode(
                StatusCodes.Status429TooManyRequests,
                new { mensaje = "Pediste demasiados códigos. Esperá un momento antes de intentar de nuevo." });
        }

        var codigo = await _codigos.GenerarAsync(usuario.Id);
        await _notificaciones.VerificacionDeCorreoAsync(usuario.Email, usuario.Nombre, codigo);

        return Ok(new { mensaje = $"Te enviamos un código nuevo a {usuario.Email}." });
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

        if (!usuario.EmailVerificado)
        {
            // Deliberately specific: the user already knows the address (they
            // typed it), so telling them to check the inbox is actionable.
            return Unauthorized(new { mensaje = "Tu correo aún no está verificado. Revisa tu bandeja de entrada e ingresa el código que te enviamos." });
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
            EmailVerificado = u.EmailVerificado,
            CreatedAt = u.CreatedAt,
        };
    }
}
