using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace IguanaSV.Api.Tests.Dashboard;

/// <summary>
/// Vertical integration slice for the host earnings dashboard. Drives
/// GET /api/Dashboard/ganancias through the real pipeline (cookie JWT + CSRF +
/// [Authorize]) against the shared "AuthN" Testcontainers Postgres and asserts
/// the aggregation contract:
///   * 401 without a session;
///   * a host sees only their own publications' reservations, an admin sees all;
///   * only 'confirmada'/'completada' count (pending/cancelled are excluded);
///   * the period windows emit a continuous zero-filled axis (14 days / 12 weeks
///     / 12 months) and never leak buckets outside the window;
///   * the optional publicacionId narrows the breakdown;
///   * the revenue date prefers fecha_pago over fecha_inicio.
/// </summary>
[Collection("AuthN")]
public sealed class DashboardIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public DashboardIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: Dashboard integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Sin_Sesion_Returns401()
    {
        var res = await Client().GetAsync("/api/Dashboard/ganancias?periodo=mes");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Solo_Estados_Pagados_Y_Realizados_Suma()
    {
        var host = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var anfitrionId = await SeedHostIdAsync(host.UserId);
        var pubId = await SeedPublicationAsync(anfitrionId);

        // Disjoint windows: the M3 EXCLUDE constraint rejects overlapping
        // *active* reservations on the same publication.
        await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");
        await SeedReservaAsync(pubId, guest.UserId, Iso(-4), Iso(-3), "completada");
        await SeedReservaAsync(pubId, guest.UserId, Iso(3), Iso(4), "pendiente");
        await SeedReservaAsync(pubId, guest.UserId, Iso(6), Iso(7), "cancelada");

        var json = await GetGananciasAsync(AuthedClient(host), "dia");

        Assert.Equal(100m, json.GetProperty("total").GetDecimal());
        Assert.Equal(2, json.GetProperty("totalReservas").GetInt32());
        var porPub = json.GetProperty("porPublicacion");
        Assert.Equal(1, porPub.GetArrayLength());
        Assert.Equal(2, porPub[0].GetProperty("reservas").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Anfitrion_Solo_Ve_Sus_Publicaciones()
    {
        var hostA = await RegisterUserAsync();
        var hostB = await RegisterUserAsync();
        var guest = await RegisterUserAsync();

        var pubA = await SeedPublicationAsync(await SeedHostIdAsync(hostA.UserId));
        var pubB = await SeedPublicationAsync(await SeedHostIdAsync(hostB.UserId));

        await SeedReservaAsync(pubA, guest.UserId, Iso(0), Iso(1), "confirmada");
        await SeedReservaAsync(pubB, guest.UserId, Iso(0), Iso(1), "confirmada");

        var jsonA = await GetGananciasAsync(AuthedClient(hostA), "dia");
        Assert.Equal(50m, jsonA.GetProperty("total").GetDecimal());

        var jsonB = await GetGananciasAsync(AuthedClient(hostB), "dia");
        Assert.Equal(50m, jsonB.GetProperty("total").GetDecimal());
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Filtro_Por_Publicacion_Narrowa_El_Desglose()
    {
        var host = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var anfitrionId = await SeedHostIdAsync(host.UserId);
        var pub1 = await SeedPublicationAsync(anfitrionId);
        var pub2 = await SeedPublicationAsync(anfitrionId);

        await SeedReservaAsync(pub1, guest.UserId, Iso(0), Iso(1), "confirmada");
        await SeedReservaAsync(pub2, guest.UserId, Iso(0), Iso(1), "confirmada");
        await SeedReservaAsync(pub2, guest.UserId, Iso(-3), Iso(-2), "completada");

        var todas = await GetGananciasAsync(AuthedClient(host), "dia");
        Assert.Equal(150m, todas.GetProperty("total").GetDecimal());

        var soloPub1 = await GetGananciasAsync(AuthedClient(host), "dia", pub1);
        Assert.Equal(50m, soloPub1.GetProperty("total").GetDecimal());
        var porPub = soloPub1.GetProperty("porPublicacion");
        Assert.Equal(1, porPub.GetArrayLength());
        Assert.Equal(pub1, porPub[0].GetProperty("publicacionId").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Admin_Ve_Todas_Las_Publicaciones()
    {
        var hostA = await RegisterUserAsync();
        var hostB = await RegisterUserAsync();
        var guest = await RegisterUserAsync();

        var pubA = await SeedPublicationAsync(await SeedHostIdAsync(hostA.UserId));
        var pubB = await SeedPublicationAsync(await SeedHostIdAsync(hostB.UserId));
        await SeedReservaAsync(pubA, guest.UserId, Iso(0), Iso(1), "confirmada");
        await SeedReservaAsync(pubB, guest.UserId, Iso(0), Iso(1), "confirmada");

        // The shared fixture accumulates rows from sibling slices, so the admin
        // total is asserted as "at least both hosts" rather than an exact sum,
        // and the breakdown must contain both hostA's and hostB's publications.
        var json = await GetGananciasAsync(AuthedClient(AdminSession()), "dia");
        Assert.True(json.GetProperty("total").GetDecimal() >= 100m);

        var ids = new List<int>();
        var porPub = json.GetProperty("porPublicacion");
        for (var i = 0; i < porPub.GetArrayLength(); i++)
        {
            ids.Add(porPub[i].GetProperty("publicacionId").GetInt32());
        }
        Assert.Contains(pubA, ids);
        Assert.Contains(pubB, ids);
    }

    [SkippableTheory]
    [Trait("Category", "Dashboard")]
    [InlineData("dia", 14)]
    [InlineData("semana", 12)]
    [InlineData("mes", 12)]
    public async Task Periodo_Emite_Eje_Continuo(string periodo, int bucketsEsperados)
    {
        var host = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");

        var json = await GetGananciasAsync(AuthedClient(host), periodo);

        var series = json.GetProperty("series");
        Assert.Equal(bucketsEsperados, series.GetArrayLength());

        // A reservation on "today" lands in the last bucket for every window.
        Assert.Equal(50m, series[bucketsEsperados - 1].GetProperty("total").GetDecimal());
        Assert.Equal(1, series[bucketsEsperados - 1].GetProperty("reservas").GetInt32());

        // Every other bucket is zero-filled (continuous axis, no holes).
        var totalSeries = 0m;
        for (var i = 0; i < series.GetArrayLength(); i++)
        {
            totalSeries += series[i].GetProperty("total").GetDecimal();
        }
        Assert.Equal(50m, totalSeries);
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Reserva_Futura_Sin_Pago_No_Entra_En_La_Ventana()
    {
        var host = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        await SeedReservaAsync(pubId, guest.UserId, Iso(10), Iso(11), "confirmada");

        var json = await GetGananciasAsync(AuthedClient(host), "dia");
        Assert.Equal(0m, json.GetProperty("total").GetDecimal());
        Assert.Equal(0, json.GetProperty("totalReservas").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Dashboard")]
    public async Task Fecha_Pago_Tiene_Prioridad_Sobre_Fecha_Inicio()
    {
        var host = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        // Starts 10 days ago but was paid today: the revenue must be attributed
        // to the payment bucket (the last "dia" bucket), not the start date.
        await SeedReservaAsync(pubId, guest.UserId, Iso(-10), Iso(-9), "confirmada",
            fechaPago: DateTime.Today.AddHours(9));

        var json = await GetGananciasAsync(AuthedClient(host), "dia");
        Assert.Equal(50m, json.GetProperty("total").GetDecimal());

        var series = json.GetProperty("series");
        Assert.Equal(0m, series[0].GetProperty("total").GetDecimal());
        Assert.Equal(50m, series[series.GetArrayLength() - 1].GetProperty("total").GetDecimal());
    }

    // ---- harness (mirrors the Resena slice) -------------------------------------

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

    private async Task<JsonElement> GetGananciasAsync(HttpClient client, string? periodo, int? publicacionId = null)
    {
        var url = "/api/Dashboard/ganancias";
        var partes = new List<string>();
        if (periodo != null) partes.Add($"periodo={periodo}");
        if (publicacionId.HasValue) partes.Add($"publicacionId={publicacionId.Value}");
        if (partes.Count > 0) url += "?" + string.Join("&", partes);

        var res = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private async Task<Session> RegisterUserAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Dashboard",
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

    private Session AdminSession() =>
        new(UserId: 0, Email: "admin@dashboard.test", Auth: MintToken("0", "admin"), Csrf: NewCsrf());

    private string MintToken(string sub, string rol)
    {
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AuthApiFactory.TestJwtKey)),
            SecurityAlgorithms.HmacSha256);
        var now = DateTimeOffset.UtcNow;
        var token = new JwtSecurityToken(
            issuer: AuthApiFactory.TestIssuer,
            audience: AuthApiFactory.TestAudience,
            claims: new[] { new Claim(AuthConstants.SubClaim, sub), new Claim(AuthConstants.RolClaim, rol) },
            notBefore: now.UtcDateTime,
            expires: now.AddMinutes(60).UtcDateTime,
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string NewCsrf() => Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");

    private static string NewEmail() => $"u{Guid.NewGuid():N}@dashboard.test".ToLowerInvariant();

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
        var departamento = new Departamento { Nombre = $"DDep {tag}" };
        var municipio = new Municipio { Nombre = $"DMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"DHost {tag}",
            Email = $"host{tag}@dashboard.test".ToLowerInvariant(),
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    private async Task<int> SeedPublicationAsync(int anfitrionId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var categoria = new Categoria { Nombre = $"DCat {tag}", Tipo = "experiencia" };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = "experiencia",
            Titulo = $"Dashboard W6 {tag}",
            Descripcion = "Seeded by the Dashboard slice.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 10,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    /// <summary>Seeds a reservation directly with an explicit state and dates.</summary>
    private async Task<int> SeedReservaAsync(
        int publicacionId, int? usuarioId, string inicio, string fin, string estado,
        DateTime? fechaPago = null)
    {
        var ini = DateOnly.Parse(inicio);
        var finD = DateOnly.Parse(fin);
        var nights = Math.Max(1, finD.DayNumber - ini.DayNumber);
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Dashboard Guest",
            EmailHuesped = NewEmail(),
            FechaInicio = ini,
            FechaFin = finD,
            NumeroHuespedes = 1,
            PrecioTotal = 50m * nights,
            Estado = estado,
            FechaPago = fechaPago,
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);
}
