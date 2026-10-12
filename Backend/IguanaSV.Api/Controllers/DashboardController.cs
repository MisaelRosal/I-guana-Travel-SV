using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Controllers;

/// <summary>
/// Host earnings dashboard. Aggregates the simulated revenue of the caller's
/// publications from the reservations that were actually paid or realized
/// (<c>confirmada</c> + <c>completada</c>); pending and cancelled rows never
/// count. Owner scoping mirrors ResenaController.GetMisResenas: a host sees
/// only the reservations behind their own publications, while an admin sees
/// every reservation. The period query string selects a trailing window
/// (Día = last 14 days, Semana = last 12 ISO weeks, Mes = last 12 months);
/// the revenue date is the payment date when present, otherwise the stay's
/// check-in date.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private const int DiasEnVentana = 14;
    private const int SemanasEnVentana = 12;
    private const int MesesEnVentana = 12;

    private readonly IguanasDbContext _context;

    public DashboardController(IguanasDbContext context)
    {
        _context = context;
    }

    // Query: GET /api/Dashboard/ganancias?periodo=dia|semana|mes&publicacionId=1
    // `periodo` is optional (defaults to "mes"); `publicacionId` optional.
    [HttpGet("ganancias")]
    [Authorize]
    public async Task<IActionResult> GetGanancias(
        [FromQuery] string? periodo,
        [FromQuery] int? publicacionId)
    {
        var sub = User.GetSubjectId();
        if (!sub.HasValue)
        {
            return Forbid();
        }

        var esAdmin = User.IsInRole(AuthConstants.AdminRole);
        var periodoNormalizado = NormalizarPeriodo(periodo);
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var inicioRango = InicioRango(periodoNormalizado, hoy);

        var query = _context.Reservas
            .AsNoTracking()
            .Where(r => r.Estado == "confirmada" || r.Estado == "completada");

        if (!esAdmin)
        {
            // Non-admins only see their own listings' revenue. A plain user with
            // no host row matches nothing and gets an all-zero dashboard, which
            // is the same shape the panel already tolerates for empty listings.
            query = query.Where(r => r.Publicacion!.Anfitrion!.UsuarioId == sub.Value);
        }

        if (publicacionId.HasValue)
        {
            query = query.Where(r => r.PublicacionId == publicacionId.Value);
        }

        var filas = await query
            .Select(r => new
            {
                r.PublicacionId,
                Titulo = r.Publicacion!.Titulo,
                Tipo = r.Publicacion!.Tipo,
                r.PrecioTotal,
                r.FechaPago,
                r.FechaInicio,
            })
            .ToListAsync();

        // Revenue date: the simulated payment timestamp when it exists, else the
        // check-in date (a reservation confirmed without going through Pay).
        var conFecha = filas
            .Select(f => new FilaGanancia(
                f.PublicacionId,
                f.Titulo,
                f.Tipo,
                f.PrecioTotal,
                f.FechaPago.HasValue ? DateOnly.FromDateTime(f.FechaPago.Value) : f.FechaInicio))
            .ToList();

        var enRango = conFecha
            .Where(f => f.Fecha >= inicioRango && f.Fecha <= hoy)
            .ToList();

        var totalGeneral = conFecha.Sum(f => f.PrecioTotal);
        var total = enRango.Sum(f => f.PrecioTotal);
        var totalReservas = enRango.Count;
        var promedio = totalReservas > 0 ? Math.Round(total / totalReservas, 2) : 0m;

        var porBucket = enRango
            .GroupBy(f => ClaveBucket(periodoNormalizado, f.Fecha))
            .ToDictionary(
                g => g.Key,
                g => (Total: g.Sum(x => x.PrecioTotal), Reservas: g.Count()));

        // Continuous axis: every bucket in the window is emitted (zero-filled),
        // so the chart never has holes on quiet days/weeks/months.
        var series = new List<object>();
        for (var cursor = inicioRango; cursor <= hoy; cursor = SiguienteBucket(periodoNormalizado, cursor))
        {
            porBucket.TryGetValue(cursor, out var acumulado);
            series.Add(new
            {
                inicio = cursor.ToString("yyyy-MM-dd"),
                total = acumulado.Total,
                reservas = acumulado.Reservas,
            });
        }

        var porPublicacion = enRango
            .GroupBy(f => new { f.PublicacionId, f.Titulo, f.Tipo })
            .Select(g => new
            {
                publicacionId = g.Key.PublicacionId,
                titulo = g.Key.Titulo,
                tipo = g.Key.Tipo,
                total = g.Sum(x => x.PrecioTotal),
                reservas = g.Count(),
            })
            .OrderByDescending(x => x.total)
            .ToList();

        return Ok(new
        {
            periodo = periodoNormalizado,
            desde = inicioRango.ToString("yyyy-MM-dd"),
            hasta = hoy.ToString("yyyy-MM-dd"),
            moneda = "USD",
            total,
            totalReservas,
            promedio,
            totalGeneral,
            series,
            porPublicacion,
        });
    }

    private static string NormalizarPeriodo(string? periodo)
    {
        var valor = periodo?.Trim().ToLowerInvariant();
        return valor is "dia" or "semana" or "mes" ? valor : "mes";
    }

    private static DateOnly InicioRango(string periodo, DateOnly hoy) => periodo switch
    {
        "dia" => hoy.AddDays(-(DiasEnVentana - 1)),
        "semana" => LunesDe(hoy).AddDays(-7 * (SemanasEnVentana - 1)),
        _ => new DateOnly(hoy.Year, hoy.Month, 1).AddMonths(-(MesesEnVentana - 1)),
    };

    private static DateOnly SiguienteBucket(string periodo, DateOnly actual) => periodo switch
    {
        "dia" => actual.AddDays(1),
        "semana" => actual.AddDays(7),
        _ => actual.AddMonths(1),
    };

    private static DateOnly ClaveBucket(string periodo, DateOnly fecha) => periodo switch
    {
        "dia" => fecha,
        "semana" => LunesDe(fecha),
        _ => new DateOnly(fecha.Year, fecha.Month, 1),
    };

    // Monday-first week key (ISO 8601): DayOfWeek is Sunday=0..Saturday=6, so the
    // offset back to Monday is ((dow + 6) % 7).
    private static DateOnly LunesDe(DateOnly fecha) =>
        fecha.AddDays(-(((int)fecha.DayOfWeek + 6) % 7));

    private sealed record FilaGanancia(
        int PublicacionId,
        string Titulo,
        string Tipo,
        decimal PrecioTotal,
        DateOnly Fecha);
}
