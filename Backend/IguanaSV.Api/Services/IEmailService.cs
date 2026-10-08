namespace IguanaSV.Api.Services;

/// <summary>
/// Lowest-level outbound email transport. Implementations must never throw for
/// a delivery failure the caller cannot act on — see
/// <see cref="IEmailNotificationService"/> which is the safe entry point used
/// by controllers. This interface exists so the transport can be faked in tests.
/// </summary>
public interface IEmailService
{
    /// <summary>
    /// Send an HTML email. Returns false (rather than throwing) when the
    /// provider rejects the message, so callers can log and continue.
    /// </summary>
    Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default);
}
