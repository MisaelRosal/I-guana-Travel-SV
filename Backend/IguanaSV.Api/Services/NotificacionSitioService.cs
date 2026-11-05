using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Services;

/// <summary>
/// Writes the in-site notification row read by the SPA bell. Fire-and-forget
/// safe like <see cref="EmailNotificationService"/>: a failed insert is logged,
/// detached and swallowed, so a notification never breaks the business
/// operation that produced it. A row needs at least one recipient locator
/// (account id or email); calls without either are skipped.
/// </summary>
public class NotificacionSitioService : INotificacionSitioService
{
    private readonly IguanasDbContext _context;
    private readonly ILogger<NotificacionSitioService> _logger;

    public NotificacionSitioService(IguanasDbContext context, ILogger<NotificacionSitioService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task NotificarAsync(
        int? usuarioId,
        string? destinatarioEmail,
        string tipo,
        string mensaje,
        int? reservaId,
        CancellationToken cancellationToken = default)
    {
        if (usuarioId is null && string.IsNullOrWhiteSpace(destinatarioEmail))
        {
            return;
        }

        var notificacion = new Notificacione
        {
            UsuarioId = usuarioId,
            DestinatarioEmail = destinatarioEmail ?? string.Empty,
            Tipo = tipo,
            Mensaje = mensaje,
            ReservaId = reservaId,
            Leida = false,
            CreatedAt = DateTime.Now,
        };
        _context.Notificaciones.Add(notificacion);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            // The notification insert must never break the business flow. The
            // failed row is detached so a later SaveChanges in the same scope
            // (e.g. the check-in worker writing the next recipient) does not
            // retry it and cascade the failure.
            _context.Entry(notificacion).State = EntityState.Detached;
            _logger.LogError(ex, "No se pudo registrar la notificación de sitio ({Tipo}).", tipo);
        }
    }
}
