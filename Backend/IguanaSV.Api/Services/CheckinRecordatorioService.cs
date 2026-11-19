using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Services;

/// <summary>
/// Background worker that drops in-site reminders for reservation deadlines:
///   * "check-in tomorrow": both sides of every confirmed reservation whose
///     stay starts the next day (the less-than-24h rule: fecha_inicio still in
///     the future and no later than tomorrow).
///   * "payment due": the guest of every UNPAID (pendiente) hospedaje
///     reservation whose stay starts exactly two days from today — the guest
///     only, the host never gets this one (the grace worker auto-cancels very
///     short pendings within 1h, so they rarely reach T-2).
/// Runs on a ~1 minute <see cref="PeriodicTimer"/>; dedupe is the notification
/// table itself — a (reserva, usuario, tipo) row is written only when absent,
/// so a restarted host never double-reminds and no stamp column was needed. A
/// failed pass is logged and swallowed (same resilience contract as
/// <see cref="ResenaAvailabilityService"/>).
/// </summary>
public class CheckinRecordatorioService : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(1);
    private const string Tipo = "checkin_manana";
    private const string TipoAvisoPago = "aviso_pago";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CheckinRecordatorioService> _logger;

    public CheckinRecordatorioService(IServiceScopeFactory scopeFactory, ILogger<CheckinRecordatorioService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await NotificarCheckinsAsync(stoppingToken);
        await NotificarAvisosPagoAsync(stoppingToken);

        using var timer = new PeriodicTimer(TickInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await NotificarCheckinsAsync(stoppingToken);
                await NotificarAvisosPagoAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown; nothing to clean up.
        }
    }

    /// <summary>
    /// Performs a single reminder pass. Public so the integration tests can
    /// drive it deterministically without waiting for a timer tick.
    /// </summary>
    public async Task NotificarCheckinsAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IguanasDbContext>();
            var notificaciones = scope.ServiceProvider.GetRequiredService<INotificacionSitioService>();

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var manana = hoy.AddDays(1);

            var candidatas = await db.Reservas
                .Include(r => r.Usuario)
                .Include(r => r.Publicacion)
                    .ThenInclude(p => p!.Anfitrion)
                        .ThenInclude(a => a!.Usuario)
                .Where(r => r.Estado == "confirmada"
                    && r.FechaInicio > hoy
                    && r.FechaInicio <= manana
                    && r.UsuarioId != null)
                .ToListAsync(cancellationToken);

            if (candidatas.Count == 0)
            {
                return;
            }

            var reservaIds = candidatas.Select(r => r.Id).ToList();
            var yaEnviadas = await db.Notificaciones
                .Where(n => n.Tipo == Tipo && n.ReservaId != null && reservaIds.Contains(n.ReservaId.Value))
                .Select(n => new { n.ReservaId, n.UsuarioId })
                .ToListAsync(cancellationToken);

            foreach (var reserva in candidatas)
            {
                var titulo = reserva.Publicacion?.Titulo ?? "tu estadía";

                if (!yaEnviadas.Any(n => n.ReservaId == reserva.Id && n.UsuarioId == reserva.UsuarioId))
                {
                    await notificaciones.NotificarAsync(
                        reserva.UsuarioId,
                        reserva.Usuario?.Email ?? reserva.EmailHuesped,
                        Tipo,
                        $"Recordatorio: tu estadía en {titulo} comienza mañana",
                        reserva.Id,
                        cancellationToken);
                }

                var anfitrion = reserva.Publicacion?.Anfitrion;
                if (anfitrion?.UsuarioId is int anfitrionUsuarioId
                    && !yaEnviadas.Any(n => n.ReservaId == reserva.Id && n.UsuarioId == anfitrionUsuarioId))
                {
                    await notificaciones.NotificarAsync(
                        anfitrionUsuarioId,
                        anfitrion.Usuario?.Email ?? anfitrion.Email,
                        Tipo,
                        $"Tu huésped {reserva.Usuario?.Nombre ?? reserva.NombreHuesped} llega mañana a {titulo}",
                        reserva.Id,
                        cancellationToken);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Shutdown requested mid-pass; let the host finish.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Check-in reminder pass failed; will retry on the next tick.");
        }
    }

    /// <summary>
    /// Performs a single payment-due pass. Public so the integration tests can
    /// drive it deterministically without waiting for a timer tick.
    /// </summary>
    public async Task NotificarAvisosPagoAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IguanasDbContext>();
            var notificaciones = scope.ServiceProvider.GetRequiredService<INotificacionSitioService>();

            var objetivo = DateOnly.FromDateTime(DateTime.Today).AddDays(2);

            var candidatas = await db.Reservas
                .Include(r => r.Usuario)
                .Include(r => r.Publicacion)
                .Where(r => r.Estado == "pendiente"
                    && r.FechaInicio == objetivo
                    && r.Publicacion!.Tipo == "hospedaje"
                    && r.UsuarioId != null)
                .ToListAsync(cancellationToken);

            if (candidatas.Count == 0)
            {
                return;
            }

            var reservaIds = candidatas.Select(r => r.Id).ToList();
            var yaEnviadas = await db.Notificaciones
                .Where(n => n.Tipo == TipoAvisoPago && n.ReservaId != null && reservaIds.Contains(n.ReservaId.Value))
                .Select(n => new { n.ReservaId, n.UsuarioId })
                .ToListAsync(cancellationToken);

            foreach (var reserva in candidatas)
            {
                if (yaEnviadas.Any(n => n.ReservaId == reserva.Id && n.UsuarioId == reserva.UsuarioId))
                {
                    continue;
                }

                var titulo = reserva.Publicacion?.Titulo ?? "tu estadía";
                await notificaciones.NotificarAsync(
                    reserva.UsuarioId,
                    reserva.Usuario?.Email ?? reserva.EmailHuesped,
                    TipoAvisoPago,
                    $"Queda poco tiempo: tu estadía en {titulo} sin pagar comienza pronto (inicia el {reserva.FechaInicio:dd/MM/yyyy}). Realiza el pago para confirmar.",
                    reserva.Id,
                    cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Shutdown requested mid-pass; let the host finish.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Payment-due reminder pass failed; will retry on the next tick.");
        }
    }
}
