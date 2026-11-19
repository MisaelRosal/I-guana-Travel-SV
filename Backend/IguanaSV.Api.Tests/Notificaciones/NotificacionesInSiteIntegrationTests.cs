using System.Net;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace IguanaSV.Api.Tests.Notificaciones;

/// <summary>
/// Vertical slice for the in-site notifications feature. Drives the real
/// pipeline over HTTP against the shared "AuthN" Testcontainers Postgres and
/// proves, end to end, that:
///   * booking a publication drops a reserva_creada row on the HOST's inbox
///     and nowhere else;
///   * GET mias is authenticated and owner-scoped;
///   * PUT {id}/leer marks only the owner's row (a stranger gets 404);
///   * PUT leer-todas marks every unread row of the caller;
///   * CheckinRecordatorioService writes exactly one reminder per side for a
///     confirmed reservation starting tomorrow, and dedupes on re-runs;
///   * CheckinRecordatorioService writes exactly one aviso_pago for the guest
///     of an unpaid hospedaje reservation starting two days out (host gets
///     none, T-1 pendings stay silent), and dedupes on re-runs;
///   * filing a guest report notifies the reported guest (reporte_recibido)
///     while every admin still gets reporte_creado for the same reserva.
/// </summary>
[Collection("AuthN")]
public sealed class NotificacionesInSiteIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public NotificacionesInSiteIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: notifications integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task ReservaCreada_NotificaAlAnfitrion_NoAlHuesped()
    {
        var (host, guest, _, reservaId) = await BookAsync();

        var hostRows = await GetMiasAsync(host);
        var creada = Assert.Single(hostRows, r => r.Tipo == "reserva_creada");
        Assert.Equal(reservaId, creada.ReservaId);
        Assert.False(creada.Leida);

        var guestRows = await GetMiasAsync(guest);
        Assert.DoesNotContain(guestRows, r => r.Tipo == "reserva_creada");
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task Mias_SinSesion401_YOtroUsuarioNoLaVe()
    {
        var (_, _, _, reservaId) = await BookAsync();
        var stranger = await RegisterUserAsync();

        var anon = await Client().GetAsync("/api/Notificacione/mias");
        Assert.Equal(HttpStatusCode.Unauthorized, anon.StatusCode);

        var strangerRows = await GetMiasAsync(stranger);
        Assert.DoesNotContain(strangerRows, r => r.Tipo == "reserva_creada" && r.ReservaId == reservaId);
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task MarcarLeida_Dueno204_YAjeno404()
    {
        var (host, _, _, _) = await BookAsync();
        var ajeno = await RegisterUserAsync();

        var creada = (await GetMiasAsync(host)).Single(r => r.Tipo == "reserva_creada");

        // A stranger cannot flip someone else's row: 404, not 403, and it stays unread.
        var ajenoRes = await AuthedClient(ajeno).PutAsync($"/api/Notificacione/{creada.Id}/leer", content: null);
        Assert.Equal(HttpStatusCode.NotFound, ajenoRes.StatusCode);

        var ok = await AuthedClient(host).PutAsync($"/api/Notificacione/{creada.Id}/leer", content: null);
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var despues = (await GetMiasAsync(host)).Single(r => r.Id == creada.Id);
        Assert.True(despues.Leida);
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task MarcarLeidasTodas_MarcaTodasLasDelCaller()
    {
        var host = await RegisterUserAsync();
        var hostId = await SeedHostIdAsync(host.UserId);
        var pubId = await SeedPublicationAsync(hostId);

        // Two bookings from two different guests: two unread rows for the host.
        var guestA = await RegisterUserAsync();
        var guestB = await RegisterUserAsync();
        Assert.Equal(HttpStatusCode.Created, (await AuthedClient(guestA).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Huesped A",
            emailHuesped = guestA.Email,
            fechaInicio = Iso(4),
            fechaFin = Iso(4),
            numeroHuespedes = 1,
        }))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await AuthedClient(guestB).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Huesped B",
            emailHuesped = guestB.Email,
            fechaInicio = Iso(4),
            fechaFin = Iso(4),
            numeroHuespedes = 1,
        }))).StatusCode);

        var res = await AuthedClient(host).PutAsync("/api/Notificacione/leer-todas", content: null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("marcadas").GetInt32());

        var rows = await GetMiasAsync(host);
        Assert.All(rows, r => Assert.True(r.Leida));
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task CheckinWorker_CreaDosRecordatorios_YElSegundoPassNoDuplica()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        // Confirmed stay starting tomorrow: the <24h reminder window.
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(1), Iso(2), "confirmada",
            emailHuesped: guest.Email);

        var service = new CheckinRecordatorioService(BuildCheckinScopeFactory(),
            NullLogger<CheckinRecordatorioService>.Instance);
        await service.NotificarCheckinsAsync(CancellationToken.None);
        await service.NotificarCheckinsAsync(CancellationToken.None);

        await using var db = NewDb();
        var filas = await db.Notificaciones
            .AsNoTracking()
            .Where(n => n.Tipo == "checkin_manana" && n.ReservaId == reservaId)
            .ToListAsync();

        // Exactly one row per side; the second pass added none.
        Assert.Equal(2, filas.Count);
        Assert.Contains(filas, f => f.UsuarioId == guest.UserId && f.Mensaje.Contains("comienza mañana"));
        Assert.Contains(filas, f => f.UsuarioId == host.UserId && f.Mensaje.Contains("llega mañana"));
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task ReportePost_NotificaReporteRecibidoAlHuesped()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        // ReporteController.Crear only accepts hosts, so promote the account.
        await using (var db = NewDb())
        {
            var hostUser = await db.Usuarios.FirstAsync(u => u.Id == host.UserId);
            hostUser.Rol = "anfitrion";
            await db.SaveChangesAsync();
        }
        var adminId = await SeedAdminIdAsync();

        // Completed stay, guest registered: the reportable state.
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(-10), Iso(-4), "completada",
            emailHuesped: guest.Email);

        var res = await AuthedClient(host).PostAsync("/api/Reporte", Json(new
        {
            reservaId,
            tipo = "dano",
            descripcion = "El huésped dejó daños en la cocina.",
        }));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        // Guest got the reporte_recibido row (and not the admin-only copy).
        var guestRows = await GetMiasAsync(guest);
        var recibido = Assert.Single(guestRows, r => r.Tipo == "reporte_recibido");
        Assert.Equal(reservaId, recibido.ReservaId);
        Assert.DoesNotContain(guestRows, r => r.Tipo == "reporte_creado");
        Assert.False(recibido.Leida);

        // Existing contract intact: every admin got reporte_creado for this reserva.
        await using var dbCheck = NewDb();
        var adminRow = await dbCheck.Notificaciones.AsNoTracking()
            .SingleAsync(n => n.Tipo == "reporte_creado"
                && n.UsuarioId == adminId
                && n.ReservaId == reservaId);
        Assert.False(adminRow.Leida ?? true);
    }

    [SkippableFact]
    [Trait("Category", "Notificaciones")]
    public async Task AvisoPagoWorker_NotificaSoloHuesped_TMinus2_YNoDuplica()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), "hospedaje");

        var dosDias = await SeedReservaAsync(pubId, guest.UserId, Iso(2), Iso(3), "pendiente",
            emailHuesped: guest.Email);
        var unDia = await SeedReservaAsync(pubId, guest.UserId, Iso(1), Iso(2), "pendiente",
            emailHuesped: guest.Email);
        // Confirmed stay tomorrow: the check-in window, regression guard against
        // the aviso_pago pass bleeding into checkin rows (and vice versa). Its
        // own publication: same-day ranges would violate the lodging overlap
        // exclusion constraint when parked beside the T-1 pending.
        var pubId2 = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), "hospedaje");
        var confirmada = await SeedReservaAsync(pubId2, guest.UserId, Iso(1), Iso(2), "confirmada",
            emailHuesped: guest.Email);

        var service = new CheckinRecordatorioService(BuildCheckinScopeFactory(),
            NullLogger<CheckinRecordatorioService>.Instance);
        await service.NotificarAvisosPagoAsync(CancellationToken.None);
        await service.NotificarCheckinsAsync(CancellationToken.None);
        await service.NotificarAvisosPagoAsync(CancellationToken.None);
        await service.NotificarCheckinsAsync(CancellationToken.None);

        await using var db = NewDb();
        var avisos = await db.Notificaciones
            .AsNoTracking()
            .Where(n => n.Tipo == "aviso_pago" && n.ReservaId != null)
            .ToListAsync();

        // Only the T-2 unpaid hospedaje, only the guest, exactly once.
        var aviso = Assert.Single(avisos);
        Assert.Equal(dosDias, aviso.ReservaId);
        Assert.Equal(guest.UserId, aviso.UsuarioId);
        Assert.Contains("sin pagar", aviso.Mensaje);

        var checkins = await db.Notificaciones
            .AsNoTracking()
            .Where(n => n.Tipo == "checkin_manana" && n.ReservaId == confirmada)
            .ToListAsync();
        Assert.Equal(2, checkins.Count);
    }

    // ---- helpers -----------------------------------------------------------------

    private async Task<int> SeedAdminIdAsync()
    {
        await using var db = NewDb();
        var admin = new Usuario
        {
            Nombre = "Notif",
            Apellido = "Admin",
            Email = NewEmail(),
            PasswordHash = "seed",
            Rol = "admin",
            EmailVerificado = true,
        };
        db.Usuarios.Add(admin);
        await db.SaveChangesAsync();
        return admin.Id;
    }

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

    private sealed record InboxRow(int Id, string Tipo, string? Mensaje, bool? Leida, int? ReservaId);

    /// <summary>Registers host+guest, seeds a host publication and books it over HTTP.</summary>
    private async Task<(Session Host, Session Guest, int PubId, int ReservaId)> BookAsync()
    {
        var host = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        var res = await AuthedClient(guest).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Inbox Guest",
            emailHuesped = guest.Email,
            fechaInicio = Iso(4),
            fechaFin = Iso(5),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return (host, guest, pubId, doc.RootElement.GetProperty("id").GetInt32());
    }

    private async Task<List<InboxRow>> GetMiasAsync(Session session)
    {
        var res = await AuthedClient(session).GetAsync("/api/Notificacione/mias");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("notificaciones").EnumerateArray()
            .Select(e => new InboxRow(
                e.GetProperty("id").GetInt32(),
                e.GetProperty("tipo").GetString()!,
                e.GetProperty("mensaje").GetString(),
                e.GetProperty("leida").ValueKind == JsonValueKind.Null
                    ? null
                    : e.GetProperty("leida").GetBoolean(),
                e.GetProperty("reservaId").ValueKind == JsonValueKind.Null
                    ? null
                    : e.GetProperty("reservaId").GetInt32()))
            .ToList();
    }

    /// <summary>
    /// A self-contained DI scope (own DbContext + the real producer service) so
    /// the background worker's pass can be driven deterministically without
    /// touching the shared factory's service registrations.
    /// </summary>
    private IServiceScopeFactory BuildCheckinScopeFactory()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<IguanasDbContext>(options => options.UseNpgsql(_fixture.ConnectionString!));
        services.AddScoped<INotificacionSitioService, NotificacionSitioService>();
        return services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
    }

    private HttpClient Client() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

    private HttpClient AuthedClient(Session session)
    {
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={session.Auth}; {AuthConstants.CsrfCookieName}={session.Csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, session.Csrf);
        return client;
    }

    private async Task<Session> RegisterUserAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Notif",
            apellido = "Tester",
            email,
            password = Password,
        }));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetInt32();
        return new Session(
            id,
            email,
            ParseCookie(res, AuthConstants.AuthCookieName).Value,
            ParseCookie(res, AuthConstants.CsrfCookieName).Value);
    }

    private static string NewEmail() => $"u{Guid.NewGuid():N}@notif.test".ToLowerInvariant();

    private static ParsedCookie ParseCookie(HttpResponseMessage res, string name)
    {
        var raws = res.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.ToList()
            : new List<string>();
        foreach (var raw in raws)
        {
            var cookie = ParsedCookie.Parse(raw);
            if (string.Equals(cookie.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return cookie;
            }
        }
        throw new InvalidOperationException($"Response did not set a '{name}' cookie.");
    }

    private static StringContent Json(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    /// <summary>An ISO yyyy-MM-dd date offset from today.</summary>
    private static string Iso(int offsetDays) =>
        DateOnly.FromDateTime(DateTime.Today).AddDays(offsetDays).ToString("yyyy-MM-dd");

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private async Task<int> SeedHostIdAsync(int usuarioId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var departamento = new Departamento { Nombre = $"NDep {tag}" };
        var municipio = new Municipio { Nombre = $"NMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"NHost {tag}",
            Email = $"host{tag}@notif.test".ToLowerInvariant(),
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    private async Task<int> SeedPublicationAsync(int anfitrionId, string tipo = "experiencia")
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var categoria = new Categoria { Nombre = $"NCat {tag}", Tipo = tipo };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = tipo,
            Titulo = $"Notif {tag}",
            Descripcion = "Seeded by the in-site notifications slice.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 10,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    private async Task<int> SeedReservaAsync(
        int publicacionId, int? usuarioId, string inicio, string fin, string estado,
        string? emailHuesped = null)
    {
        var ini = DateOnly.Parse(inicio);
        var finD = DateOnly.Parse(fin);
        var nights = Math.Max(1, finD.DayNumber - ini.DayNumber);
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Notif Guest",
            EmailHuesped = emailHuesped ?? NewEmail(),
            FechaInicio = ini,
            FechaFin = finD,
            NumeroHuespedes = 1,
            PrecioTotal = 50m * nights,
            Estado = estado,
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }
}
