namespace IguanaSV.Api.Services;

/// <summary>
/// Placeholder transport used while no outbound email provider is configured.
/// When <see cref="SendAsync"/> is called it logs that no provider is wired and
/// returns false, so the verification flow falls back to its "delivery failed"
/// path (the account is activated without blocking the user). Replace this
/// registration with a real <see cref="IEmailService"/> (e.g. Gmail) when ready.
/// </summary>
public sealed class NoOpEmailService : IEmailService
{
    private readonly ILogger<NoOpEmailService> _logger;

    public NoOpEmailService(ILogger<NoOpEmailService> logger)
    {
        _logger = logger;
    }

    public Task<bool> SendAsync(
        string to,
        string subject,
        string html,
        CancellationToken cancellationToken = default)
    {
        _logger.LogWarning(
            "Email no enviado a {To} ({Subject}): no hay proveedor de correo configurado.",
            to, subject);
        return Task.FromResult(false);
    }
}