using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Services;

/// <summary>
/// Background worker that flips paid reservations to <c>completada</c> once
/// their checkout day has passed (<c>fecha_fin &lt; today</c>). Until this ran,
/// the "Reservas completadas" group in Mis Reservas was permanently empty: the
/// state existed in the UI but nothing ever assigned it. Runs on a
/// <see cref="PeriodicTimer"/> (~1 minute), mirroring
/// <see cref="GraceExpirationService"/>: a failed pass is logged and swallowed
/// so a transient database error never tears down the host, and a fresh scope
/// is created per tick so the scoped <see cref="IguanasDbContext"/> never
/// outlives a pass.
/// </summary>
public class ReservaCompletionService : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReservaCompletionService> _logger;

    public ReservaCompletionService(IServiceScopeFactory scopeFactory, ILogger<ReservaCompletionService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run one immediately so reservations that ended while the host was
        // down are not left "confirmada" for an extra full minute at startup.
        await MarcarCompletadasAsync(stoppingToken);

        using var timer = new PeriodicTimer(TickInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await MarcarCompletadasAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown; nothing to clean up.
        }
    }

    /// <summary>
    /// Performs a single scan-and-flip pass. Public so the integration tests
    /// can drive it deterministically without waiting for a timer tick.
    /// </summary>
    public async Task MarcarCompletadasAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IguanasDbContext>();

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var vencidas = await db.Reservas
                .Where(r => r.Estado == "confirmada" && r.FechaFin < hoy)
                .ToListAsync(cancellationToken);

            if (vencidas.Count == 0)
            {
                return;
            }

            var ahora = DateTime.Now;
            foreach (var reserva in vencidas)
            {
                reserva.Estado = "completada";
                reserva.UpdatedAt = ahora;
            }

            await db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Reservas completadas: {Cantidad} pasaron a 'completada'.", vencidas.Count);
        }
        catch (OperationCanceledException)
        {
            // Shutdown requested mid-pass; let the host finish.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Reserva completion pass failed; will retry on the next tick.");
        }
    }
}
