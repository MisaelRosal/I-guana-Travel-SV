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

namespace IguanaSV.Api.Tests.Agenda;

/// <summary>
/// Vertical integration slice for A-20 (operator calendar/agenda). Drives the
/// real pipeline (cookie JWT + [Authorize]) over HTTP against the shared
/// ephemeral Testcontainers Postgres and asserts the owner-scoping contract of
/// GET /api/Reserva/agenda: a host sees only the reservations behind their own
/// publications, an admin sees every reservation, a plain user without a host
/// row gets an empty agenda, and anonymous callers are rejected with 401.
/// </summary>
[Collection("AuthN")]
public sealed class AgendaIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public AgendaIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: agenda integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [SkippableFact]
    [Trait("Category", "Agenda")]
    public async Task Host_SeesOnlyOwnPublicationsReservations()
    {
        var hostA = await RegisterUserAsync();
        var seedA = await SeedPublicationOwnedByUserAsync(hostA.UserId);
        await SeedReservaAsync(seedA.PublicacionId, "2026-12-01", "2026-12-04", "confirmada");
        await SeedReservaAsync(seedA.PublicacionId, "2026-12-10", "2026-12-12", "pendiente");

        var hostB = await RegisterUserAsync();
        var seedB = await SeedPublicationOwnedByUserAsync(hostB.UserId);
        await SeedReservaAsync(seedB.PublicacionId, "2026-12-05", "2026-12-06", "confirmada");

        var agendaA = await GetAgendaAsync(hostA);
        Assert.Equal(2, agendaA.Count());
        Assert.All(agendaA, r => Assert.Equal(seedA.PublicacionId, r.GetProperty("publicacionId").GetInt32()));

        // Ordered ascending by check-in.
        var inicios = agendaA.Select(r => r.GetProperty("fechaInicio").GetString()).ToList();
        Assert.Equal(new[] { "2026-12-01", "2026-12-10" }, inicios);

        var agendaB = await GetAgendaAsync(hostB);
        Assert.Single(agendaB);
        Assert.Equal(seedB.PublicacionId, agendaB.Single().GetProperty("publicacionId").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Agenda")]
    public async Task Admin_SeesEveryReservation()
    {
        var host = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(host.UserId);
        await SeedReservaAsync(seed.PublicacionId, "2026-12-01", "2026-12-03", "confirmada");

        var other = await RegisterUserAsync();
        var seedOther = await SeedPublicationOwnedByUserAsync(other.UserId);
        await SeedReservaAsync(seedOther.PublicacionId, "2026-12-04", "2026-12-05", "confirmada");

        var agenda = await GetAgendaWithTokenAsync(AdminToken());
        Assert.True(agenda.Count >= 2);
        var fechas = agenda.Select(r => r.GetProperty("fechaInicio").GetString()).ToHashSet();
        Assert.Contains("2026-12-01", fechas);
        Assert.Contains("2026-12-04", fechas);
    }

    [SkippableFact]
    [Trait("Category", "Agenda")]
    public async Task Anonymous_Returns401()
    {
        var res = await Client().GetAsync("/api/Reserva/agenda");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Agenda")]
    public async Task PlainUserWithoutHostRow_GetsEmptyAgenda()
    {
        // A registered account with no host row owns no publications: the agenda
        // must be an empty list, never a 403 or a peek at someone else's rows.
        var host = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(host.UserId);
        await SeedReservaAsync(seed.PublicacionId, "2026-12-01", "2026-12-03", "confirmada");

        var plain = await RegisterUserAsync();
        var agenda = await GetAgendaAsync(plain);
        Assert.Empty(agenda);
    }

    // ---- helpers -----------------------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

    private sealed record Seed(int MunicipioId, int CategoriaId, int AnfitrionId, int PublicacionId);

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

    private async Task<IReadOnlyList<JsonElement>> GetAgendaAsync(Session session)
    {
        var res = await AuthedClient(session).GetAsync("/api/Reserva/agenda");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return ParseAgenda(await res.Content.ReadAsStringAsync());
    }

    private static IReadOnlyList<JsonElement> ParseAgenda(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.EnumerateArray().Select(e => e.Clone()).ToList();
    }

    // ---- admin harness ------------------------------------------------------------

    private string AdminToken() =>
        MintToken(sub: "999999", rol: AuthConstants.AdminRole,
            notBefore: DateTimeOffset.UtcNow.AddMinutes(-1),
            expires: DateTimeOffset.UtcNow.AddMinutes(30));

    private HttpClient ClientWithToken(string token)
    {
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={token}");
        return client;
    }

    private async Task<IReadOnlyList<JsonElement>> GetAgendaWithTokenAsync(string token)
    {
        var res = await ClientWithToken(token).GetAsync("/api/Reserva/agenda");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return ParseAgenda(await res.Content.ReadAsStringAsync());
    }

    private static string MintToken(string sub, string rol, DateTimeOffset notBefore, DateTimeOffset expires)
    {
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AuthApiFactory.TestJwtKey)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: AuthApiFactory.TestIssuer,
            audience: AuthApiFactory.TestAudience,
            claims: new[] { new Claim(AuthConstants.SubClaim, sub), new Claim(AuthConstants.RolClaim, rol) },
            notBefore: notBefore.UtcDateTime,
            expires: expires.UtcDateTime,
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private async Task<Session> RegisterUserAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Agenda",
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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@agenda.test".ToLowerInvariant();

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

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private async Task<(int MunicipioId, int CategoriaId)> SeedGeoAndCategoryAsync()
    {
        var tag = Guid.NewGuid().ToString("N");
        await using var db = NewDb();

        var departamento = new Departamento { Nombre = $"Dep {tag}" };
        var municipio = new Municipio { Nombre = $"Mun {tag}", Departamento = departamento };
        var categoria = new Categoria { Nombre = $"Cat {tag}", Tipo = "experiencia" };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();
        return (municipio.Id, categoria.Id);
    }

    private async Task<int> SeedHostAsync(int usuarioId, int municipioId)
    {
        await using var db = NewDb();
        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipioId,
            Nombre = $"Host {Guid.NewGuid():N}",
            Email = NewEmail(),
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    private async Task<int> SeedExperienciaAsync(int anfitrionId, int categoriaId)
    {
        await using var db = NewDb();
        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoriaId,
            Tipo = "experiencia",
            Titulo = "Ruta del café",
            Descripcion = "Seeded for the agenda.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 6,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    private async Task<int> SeedReservaAsync(int publicacionId, string inicio, string fin, string estado)
    {
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            NombreHuesped = $"Huésped {Guid.NewGuid():N}",
            EmailHuesped = NewEmail(),
            FechaInicio = DateOnly.Parse(inicio),
            FechaFin = DateOnly.Parse(fin),
            NumeroHuespedes = 2,
            PrecioTotal = 100m,
            Estado = estado,
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task<Seed> SeedPublicationOwnedByUserAsync(int usuarioId)
    {
        var (municipioId, categoriaId) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId, municipioId);
        var publicacionId = await SeedExperienciaAsync(anfitrionId, categoriaId);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId);
    }
}
