namespace IguanaSV.Api.Services;

/// <summary>
/// Writes in-site notification rows (the <c>notificaciones</c> table) read by
/// the SPA bell. Kept separate from <see cref="IEmailNotificationService"/> so
/// an event can fan out to both channels independently.
/// </summary>
public interface INotificacionSitioService
{
    /// <summary>
    /// Adds one notification for <paramref name="usuarioId"/> (or, for legacy
    /// recipients without an account, just their <paramref name="destinatarioEmail"/>).
    /// Never throws: failures are logged and swallowed so the business operation
    /// that raised the event cannot be broken by its notification.
    /// </summary>
    Task NotificarAsync(
        int? usuarioId,
        string? destinatarioEmail,
        string tipo,
        string mensaje,
        int? reservaId,
        CancellationToken cancellationToken = default);
}
