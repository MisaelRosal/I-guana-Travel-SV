using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Services;

/// <summary>
/// Background worker that emails each guest the moment their stay or
/// experience becomes reviewable (arrival day reached, reservation confirmed
/// or completed, not notified yet). The pass runs on a ~1 minute
/// <see cref="PeriodicTimer"/>; a two-day look-back window gives a restarted
/// host a chance to catch up without spamming guests about long-past trips.
///
/// The <c>resenas_notificadas_en</c> stamp is only written when the provider
/// accepted the message, so a failed send retries on the next tick for as
/// long as the reservation stays inside the window. A failed pass is logged
/// and swallowed (same resilience contract as <see cref="GraceExpirationService"/>).
/// </summary>
public class ResenaAvailabilityService : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(1);
    private static readonly int VentanaDias = 2;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ResenaAvailabilityService> _logger;

    public ResenaAvailabilityService(IServiceScopeFactory scopeFactory, ILogger<ResenaAvailabilityService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await NotificarDisponiblesAsync(stoppingToken);

        using var timer = new PeriodicTimer(TickInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await NotificarDisponiblesAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown; nothing to clean up.
        }
    }

    /// <summary>
    /// Performs a single scan-and-notify pass. Public so the integration tests
    /// can drive it deterministically without waiting for a timer tick.
    /// </summary>
    public async Task NotificarDisponiblesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IguanasDbContext>();
            var notificaciones = scope.ServiceProvider.GetRequiredService<IEmailNotificationService>();

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var desde = hoy.AddDays(-VentanaDias);

            var candidatas = await db.Reservas
                .Include(r => r.Usuario)
                .Include(r => r.Publicacion)
                .Where(r => (r.Estado == "confirmada" || r.Estado == "completada")
                    && r.FechaInicio >= desde
                    && r.FechaInicio <= hoy
                    && r.ResenasNotificadasEn == null
                    && r.UsuarioId != null)
                .ToListAsync(cancellationToken);

            if (candidatas.Count == 0)
            {
                return;
            }

            var notificadas = false;
            foreach (var reserva in candidatas)
            {
                var email = reserva.Usuario?.Email;
                if (string.IsNullOrWhiteSpace(email))
                {
                    continue;
                }

                var enviado = await notificaciones.ResenaDisponibleAsync(
                    email,
                    reserva.Usuario!.Nombre,
                    reserva.Publicacion?.Titulo ?? "tu estancia");

                if (enviado)
                {
                    reserva.ResenasNotificadasEn = DateTime.Now;
                    notificadas = true;
                }
            }

            if (notificadas)
            {
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Shutdown requested mid-pass; let the host finish.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Review availability pass failed; will retry on the next tick.");
        }
    }
}
