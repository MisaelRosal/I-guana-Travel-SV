using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Services;

/// <summary>
/// Background worker that auto-cancels short (<24h) reservations whose one-hour
/// grace window has lapsed without payment. Runs on a <see cref="PeriodicTimer"/>
/// (~1 minute) and scans, on every tick, for <c>pendiente</c> rows whose
/// <c>fecha_expiracion_gracia</c> is no longer in the future, then flips them to
/// <c>cancelada</c>.
///
/// The pass is intentionally resilient: any failure is logged and swallowed so a
/// transient database error never tears down the host. A fresh scope is created
/// per tick so the scoped <see cref="IguanasDbContext"/> never outlives a pass.
/// </summary>
public class GraceExpirationService : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GraceExpirationService> _logger;

    public GraceExpirationService(IServiceScopeFactory scopeFactory, ILogger<GraceExpirationService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run one pass immediately so a reservation that lapsed while the host was
        // down is not left pending for an extra full minute at startup.
        await ExpireOverdueAsync(stoppingToken);

        using var timer = new PeriodicTimer(TickInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await ExpireOverdueAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown; nothing to clean up.
        }
    }

    /// <summary>
    /// Performs a single scan-and-cancel pass. Public so the integration tests can
    /// drive it deterministically without waiting for a timer tick.
    /// </summary>
    public async Task ExpireOverdueAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IguanasDbContext>();

            var now = DateTime.Now;
            var vencidas = await db.Reservas
                .Where(r => r.Estado == "pendiente"
                    && r.FechaExpiracionGracia != null
                    && r.FechaExpiracionGracia <= now)
                .ToListAsync(cancellationToken);

            if (vencidas.Count == 0)
            {
                return;
            }

            foreach (var reserva in vencidas)
            {
                reserva.Estado = "cancelada";
                reserva.UpdatedAt = now;
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Shutdown requested mid-pass; let the host finish.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Grace expiration pass failed; will retry on the next tick.");
        }
    }
}
