using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Services;

/// <summary>
/// Wraps <see cref="IEmailService"/> with the per-message audit row and the
/// shared HTML shell. Every method is fire-and-forget safe: it logs the
/// failure and returns, never surfacing an exception into a controller.
/// </summary>
public class EmailNotificationService : IEmailNotificationService
{
    private readonly IEmailService _email;
    private readonly IguanasDbContext _context;
    private readonly EmailOptions _options;
    private readonly ILogger<EmailNotificationService> _logger;

    public EmailNotificationService(
        IEmailService email,
        IguanasDbContext context,
        IOptions<EmailOptions> options,
        ILogger<EmailNotificationService> logger)
    {
        _email = email;
        _context = context;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<bool> NotificarAsync(
        string destinatario,
        string asunto,
        string tipo,
        string html,
        int? usuarioId = null,
        CancellationToken cancellationToken = default)
    {
        var registro = new NotificacionEmail
        {
            UsuarioId = usuarioId,
            Destinatario = destinatario,
            Asunto = asunto,
            Tipo = tipo,
            Estado = "pendiente",
            CreadoEn = DateTime.Now,
        };
        _context.NotificacionesEmail.Add(registro);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            // The audit insert itself must never break the business flow.
            _logger.LogError(ex, "No se pudo registrar el intento de email a {To}.", destinatario);
            return false;
        }

        // Wrap the bare body in the shared branded shell (banner, card, footer) so
        // every outgoing email carries the same design; the audited row keeps
        // tracking only the business fact, not the presentation. The H1 drops the
        // " - I Guana Travel SV" suffix already carried by the banner.
        var titulo = asunto.Replace(" - I Guana Travel SV", string.Empty, StringComparison.OrdinalIgnoreCase);
        var plantilla = Envoltorio(titulo, html);
        var enviado = await _email.SendAsync(destinatario, asunto, plantilla, cancellationToken);

        registro.Estado = enviado ? "enviado" : "error";
        registro.MensajeError = enviado
            ? null
            : "El proveedor de correo rechazó el envío o Email:From no está configurado.";

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo actualizar el estado del email a {To}.", destinatario);
        }

        return enviado;
    }

    public Task<bool> VerificacionDeCorreoAsync(
        string destinatario, string nombre, string codigo, CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombre)},</p>
            <p>Tu código de verificación es:</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0;font-family:monospace;">{codigo}</p>
            <p>Ingresa este código en la pantalla de verificación para completar tu registro.</p>
            <p>Caduca en {_options.VerificacionExpiraMinutos} minutos.</p>
            <p>Si no creaste esta cuenta, ignora este correo.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Código de verificación - I Guana Travel SV",
            "verificacion_correo",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    public Task<bool> BienvenidaAsync(
        string destinatario, string nombre, CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombre)},</p>
            <p>Tu correo está verificado y tu cuenta en I Guana Travel SV ya está activa.</p>
            <p>Ya podés reservar hospedajes y experiencias, y si querés, publicar tu propio espacio como anfitrión.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Cuenta activada - I Guana Travel SV",
            "bienvenida",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    public Task<bool> SeAnfitrionAsync(
        string destinatario, string nombre, CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombre)},</p>
            <p>¡Buenas noticias! Ya sos anfitrión en I Guana Travel SV.</p>
            <p>Tu perfil todavía no está verificado por nuestro equipo. Cuando lo esté, vas a recibir un correo avisándote.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Ya sos anfitrión - I Guana Travel SV",
            "registro_anfitrion",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    public Task<bool> PerfilAnfitrionActualizadoAsync(
        string destinatario, string nombre, CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombre)},</p>
            <p>Guardamos los cambios que hiciste en tu perfil de anfitrión.</p>
            <p>Si no reconocés esta actividad, revisá la seguridad de tu cuenta.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Perfil de anfitrión actualizado - I Guana Travel SV",
            "perfil_anfitrion_actualizado",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    public Task<bool> AnfitrionVerificadoAsync(
        string destinatario, string nombre, CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombre)},</p>
            <p>¡Listo! Nuestro equipo verificó tu perfil de anfitrión.</p>
            <p>A partir de ahora tus publicaciones muestran el sello de anfitrión verificado.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Perfil verificado - I Guana Travel SV",
            "anfitrion_verificado",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    public Task<bool> PublicacionCreadaAsync(
        string destinatario, string nombre, string titulo, CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombre)},</p>
            <p>Tu publicación "{Esc(titulo)}" ya está creada y publicada en I Guana Travel SV.</p>
            <p>La podés editar o pausar en cualquier momento desde tu panel de anfitrión.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Publicación creada - I Guana Travel SV",
            "publicacion_creada",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    public Task<bool> ReservaCreadaAsync(
        string destinatario,
        string nombreHuesped,
        string tituloPublicacion,
        DateOnly fechaInicio,
        DateOnly fechaFin,
        int huespedes,
        decimal precioTotal,
        CancellationToken cancellationToken = default)
    {
        var cuerpo = $"""
            <p>Hola {Esc(nombreHuesped)},</p>
            <p>Tu reserva de "{Esc(tituloPublicacion)}" quedó registrada.</p>
            <p>Fechas: {fechaInicio:dd/MM/yyyy} al {fechaFin:dd/MM/yyyy}</p>
            <p>Huéspedes: {huespedes}</p>
            <p>Total: ${precioTotal:N2}</p>
            <p>Este es un pago simulado: no se realizó ningún cobro. Completá el pago desde tu panel para confirmar la reserva.</p>
            """;

        return NotificarAsync(
            destinatario,
            "Reserva registrada - I Guana Travel SV",
            "reserva_creada",
            cuerpo,
            cancellationToken: cancellationToken);
    }

    /// <summary>
    /// Branded HTML shell every outgoing email is wrapped in: dark-green header
    /// with the brand mark, white rounded card holding the title and body, and a
    /// muted footer. Inline styles + table layout only (email-client safe:
    /// Outlook/Gmail ignore external CSS and flexbox).
    /// </summary>
    private static string Envoltorio(string titulo, string cuerpo) => $"""
        <!doctype html>
        <html lang="es">
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#f4f1ea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:32px 16px;">
                <table role="presentation" width="560" cellpadding="0" cellspacing="0"
                       style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e4ddd0;overflow:hidden;box-shadow:0 2px 10px rgba(31,77,58,.06);">
                  <tr>
                    <td style="background:linear-gradient(135deg,#1f4d3a,#2f6b52);padding:26px 28px;">
                      <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.4px;">🦎 I Guana Travel SV</p>
                      <p style="margin:6px 0 0;font-size:13px;color:#cfe6da;">Tu plataforma de viajes y experiencias en El Salvador</p>
                    </td>
                  </tr>
                  <tr><td style="padding:30px 30px 8px;">
                    <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#1f4d3a;">{titulo}</h1>
                    <div style="font-size:15px;line-height:1.7;color:#3a3a3a;">{cuerpo}</div>
                  </td></tr>
                  <tr>
                    <td style="padding:18px 30px;border-top:1px solid #eee7da;font-size:12px;color:#8a7d66;line-height:1.6;">
                      Este correo fue enviado automáticamente por I Guana Travel SV.<br>
                      Si no reconocés esta actividad, ignorá este mensaje.
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </body>
        </html>
        """;

    /// <summary>Minimal HTML escaping for interpolated user data.</summary>
    private static string Esc(string? valor) =>
        System.Net.WebUtility.HtmlEncode(valor ?? string.Empty);
}
