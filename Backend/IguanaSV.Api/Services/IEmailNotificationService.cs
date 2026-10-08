namespace IguanaSV.Api.Services;

/// <summary>
/// Safe, audit-logged entry point for every outbound email. Controllers call
/// this (never <see cref="IEmailService"/> directly): a failed delivery is
/// recorded and swallowed, so it can NEVER fail the registration, publication
/// or reservation that triggered it. The bool return is the only signal a
/// caller may act on (e.g. "activation email never reached the mailbox").
/// </summary>
public interface IEmailNotificationService
{
    /// <summary>
    /// Record and attempt an arbitrary HTML email. Never throws.
    /// Returns true when the provider accepted the message.
    /// </summary>
    Task<bool> NotificarAsync(
        string destinatario,
        string asunto,
        string tipo,
        string html,
        int? usuarioId = null,
        CancellationToken cancellationToken = default);

    Task<bool> VerificacionDeCorreoAsync(string destinatario, string nombre, string codigo, CancellationToken cancellationToken = default);

    Task<bool> BienvenidaAsync(string destinatario, string nombre, CancellationToken cancellationToken = default);

    Task<bool> SeAnfitrionAsync(string destinatario, string nombre, CancellationToken cancellationToken = default);

    Task<bool> PerfilAnfitrionActualizadoAsync(string destinatario, string nombre, CancellationToken cancellationToken = default);

    Task<bool> AnfitrionVerificadoAsync(string destinatario, string nombre, CancellationToken cancellationToken = default);

    Task<bool> PublicacionCreadaAsync(string destinatario, string nombre, string titulo, CancellationToken cancellationToken = default);

    Task<bool> ReservaCreadaAsync(
        string destinatario,
        string nombreHuesped,
        string tituloPublicacion,
        DateOnly fechaInicio,
        DateOnly fechaFin,
        int huespedes,
        decimal precioTotal,
        CancellationToken cancellationToken = default);
}
