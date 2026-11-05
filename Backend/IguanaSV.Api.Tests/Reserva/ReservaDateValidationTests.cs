using System.Net;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace IguanaSV.Api.Tests.FechaReserva;

/// <summary>
/// Booking-path validation slice: (A1) a reservation may not start in the past
/// (the fake-review vector), and (A4) experience bookings are bound by the
/// day's horarios (no horario-less days) and their cupos. Drives the real HTTP
/// pipeline against the shared AuthN Testcontainers collection.
/// </summary>
[Collection("AuthN")]
public sealed class ReservaDateValidationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public ReservaDateValidationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: reserva date validation tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task PostReserva_PastDates_Returns400()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(null), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var res = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Past Guest",
            emailHuesped = user.Email,
            fechaInicio = Iso(-3),
            fechaFin = Iso(-1),
            numeroHuespedes = 1,
        }));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("pasado", await res.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task ExperienciaBooking_WithoutHorario_OrOverCupos_Returns409()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(null), tipo: "experiencia",
            precioPorNoche: 50m, capacidad: 4);

        // Date without a published horario: booking must be refused (A4).
        var sinHorario = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Exp Guest",
            emailHuesped = user.Email,
            fechaInicio = Iso(10),
            fechaFin = Iso(10),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Conflict, sinHorario.StatusCode);

        // Published horario with cupos = 1: the first guest fits, a second does
        // not (capacity counts the date's active reservations).
        await SeedHorarioAsync(pubId, DateOnly.Parse(Iso(12)), cupos: 1);

        var primera = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Exp Guest",
            emailHuesped = user.Email,
            fechaInicio = Iso(12),
            fechaFin = Iso(12),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, primera.StatusCode);

        var llena = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Exp Guest 2",
            emailHuesped = user.Email,
            fechaInicio = Iso(12),
            fechaFin = Iso(12),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Conflict, llena.StatusCode);
        Assert.Contains("cupo", await llena.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    // ---- helpers ---------------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

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
            nombre = "Fecha",
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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@fecha.test".ToLowerInvariant();

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

    private static string Iso(int offsetDays) =>
        DateOnly.FromDateTime(DateTime.Today).AddDays(offsetDays).ToString("yyyy-MM-dd");

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private async Task<int> SeedHostIdAsync(int? usuarioId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var departamento = new Departamento { Nombre = $"FDep {tag}" };
        var municipio = new Municipio { Nombre = $"FMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"FHost {tag}",
            Email = $"host{tag}@fecha.test".ToLowerInvariant(),
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    private async Task<int> SeedPublicationAsync(int anfitrionId, string tipo, decimal precioPorNoche, int capacidad)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var categoria = new Categoria { Nombre = $"FCat {tag}", Tipo = tipo };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = tipo,
            Titulo = $"Fecha {tag}",
            Descripcion = "Seeded by the date-validation slice.",
            PrecioPorNoche = precioPorNoche,
            CapacidadMaxima = capacidad,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    private async Task SeedHorarioAsync(int publicacionId, DateOnly fecha, int cupos)
    {
        await using var db = NewDb();
        db.Horarios.Add(new Horario
        {
            PublicacionId = publicacionId,
            Fecha = fecha,
            HoraInicio = new TimeOnly(10, 0),
            HoraFin = new TimeOnly(12, 0),
            Disponible = true,
            Cupos = cupos,
        });
        await db.SaveChangesAsync();
    }
}
