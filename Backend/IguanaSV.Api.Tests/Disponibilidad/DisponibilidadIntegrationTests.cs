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

namespace IguanaSV.Api.Tests.Disponibilidad;

/// <summary>
/// Vertical integration slice for the A-21 availability manager and the A-22
/// image editing gates. Drives the real pipeline (cookie JWT + CSRF gate +
/// [Authorize] matrix) over HTTP against the shared ephemeral Testcontainers
/// Postgres. Covers: an operator blocks a dated horario and edits its slots
/// (persisted and exposed on the public catalog), the Horario and
/// ImagenesPublicacion mutations are owner-or-admin only, and the per-date
/// availability values survive the publication PUT replace cycle.
/// </summary>
[Collection("AuthN")]
public sealed class DisponibilidadIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public DisponibilidadIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: availability integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- A-21: per-date availability persistence ---------------------------------

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Owner_BlocksDateAndSetsCupos_PersistsAndExposesPublicly()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2026-11-10", disponible: true);

        var res = await AuthedClient(owner).PutAsync($"/api/Horario/{horarioId}",
            HorarioBody(seed.PublicacionId, "2026-11-10", disponible: false, cupos: 5));
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        await using (var db = NewDb())
        {
            var horario = await db.Horarios.AsNoTracking().FirstAsync(h => h.Id == horarioId);
            Assert.False(horario.Disponible);
            Assert.Equal(5, horario.Cupos);
            Assert.Equal(new DateOnly(2026, 11, 10), horario.Fecha);
        }

        // The public catalog read reflects the block + slots without auth.
        var publicRead = await Client().GetAsync($"/api/Publicacione/{seed.PublicacionId}");
        Assert.Equal(HttpStatusCode.OK, publicRead.StatusCode);
        using var doc = JsonDocument.Parse(await publicRead.Content.ReadAsStringAsync());
        var horarioJson = doc.RootElement.GetProperty("horarios").EnumerateArray()
            .Single(h => h.GetProperty("id").GetInt32() == horarioId);
        Assert.False(horarioJson.GetProperty("disponible").GetBoolean());
        Assert.Equal(5, horarioJson.GetProperty("cupos").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Owner_CreatesDatedHorario_PersistsDisponibleAndCupos()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);

        var res = await AuthedClient(owner).PostAsync("/api/Horario",
            HorarioBody(seed.PublicacionId, "2026-12-01", disponible: false, cupos: 3));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var createdId = doc.RootElement.GetProperty("id").GetInt32();

        await using var db = NewDb();
        var horario = await db.Horarios.AsNoTracking().FirstAsync(h => h.Id == createdId);
        Assert.False(horario.Disponible);
        Assert.Equal(3, horario.Cupos);
        Assert.Equal(new DateOnly(2026, 12, 1), horario.Fecha);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task NonOwner_EditDeleteAndCreateHorario_Returns403_Anonymous401()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2026-11-10", disponible: true);

        // Anonymous: the [Authorize] attribute short-circuits with 401.
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PutAsync($"/api/Horario/{horarioId}",
                HorarioBody(seed.PublicacionId, "2026-11-10", false, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().DeleteAsync($"/api/Horario/{horarioId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PostAsync("/api/Horario",
                HorarioBody(seed.PublicacionId, "2026-11-10", true, 1))).StatusCode);

        // Authenticated but not the host owner -> ownership gate forbids.
        var intruder = await RegisterUserAsync();
        var client = AuthedClient(intruder);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PutAsync($"/api/Horario/{horarioId}",
                HorarioBody(seed.PublicacionId, "2026-11-10", false, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.DeleteAsync($"/api/Horario/{horarioId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsync("/api/Horario",
                HorarioBody(seed.PublicacionId, "2026-11-10", true, 1))).StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Owner_DeleteHorario_Returns204()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2026-11-10", disponible: true);

        var res = await AuthedClient(owner).DeleteAsync($"/api/Horario/{horarioId}");
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        await using var db = NewDb();
        Assert.False(await db.Horarios.AnyAsync(h => h.Id == horarioId));
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task PublicationPut_PreservesPerDateDisponibleAndCupos()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        await SeedDatedHorarioAsync(seed.PublicacionId, "2026-11-10", disponible: false, cupos: 4);

        // The frontend sends the full horario list with the availability merged
        // back in; the PUT must not silently reset the block or the slots.
        var body = Json(new
        {
            id = seed.PublicacionId,
            anfitrionId = seed.AnfitrionId,
            categoriaId = seed.CategoriaId,
            titulo = "Ruta del café",
            descripcion = "Actualizada",
            tipo = "experiencia",
            precioPorNoche = 50,
            capacidadMaxima = 4,
            horarios = new[]
            {
                new
                {
                    fecha = "2026-11-10",
                    horaInicio = "08:00:00",
                    horaFin = "12:00:00",
                    disponible = false,
                    cupos = 4,
                },
            },
            experiencia = Array.Empty<object>(),
            publicacionAmenidads = Array.Empty<object>(),
        });

        var res = await AuthedClient(owner).PutAsync($"/api/Publicacione/{seed.PublicacionId}", body);
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        await using var db = NewDb();
        var horario = await db.Horarios.AsNoTracking()
            .SingleAsync(h => h.PublicacionId == seed.PublicacionId && h.Fecha == new DateOnly(2026, 11, 10));
        Assert.False(horario.Disponible);
        Assert.Equal(4, horario.Cupos);
    }

    // ---- A-22: image editing gates -----------------------------------------------

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task ImageMutations_Anonymous401_NonOwner403_Owner2xx()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();
        var imagenId = await SeedImageAsync(seed.PublicacionId);

        var body = ImageBody(seed.PublicacionId, "https://cdn.test/new.jpg");

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PostAsync("/api/ImagenesPublicacion", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PutAsync($"/api/ImagenesPublicacion/{imagenId}", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().DeleteAsync($"/api/ImagenesPublicacion/{imagenId}")).StatusCode);

        var intruder = await RegisterUserAsync();
        var intruderClient = AuthedClient(intruder);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await intruderClient.PostAsync("/api/ImagenesPublicacion", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await intruderClient.PutAsync($"/api/ImagenesPublicacion/{imagenId}", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await intruderClient.DeleteAsync($"/api/ImagenesPublicacion/{imagenId}")).StatusCode);

        // The real owner can create, reorder and delete.
        var owner = await RegisterUserAsync();
        var owned = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var ownerImageId = await SeedImageAsync(owned.PublicacionId);
        var ownerClient = AuthedClient(owner);

        var post = await ownerClient.PostAsync("/api/ImagenesPublicacion",
            ImageBody(owned.PublicacionId, "https://cdn.test/new.jpg"));
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);

        var put = await ownerClient.PutAsync($"/api/ImagenesPublicacion/{ownerImageId}",
            ImageBody(owned.PublicacionId, "https://cdn.test/reordered.jpg"));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var delete = await ownerClient.DeleteAsync($"/api/ImagenesPublicacion/{ownerImageId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Owner_ImageCreate_IgnoresForeignPublicationTarget()
    {
        // A non-admin may not attach an image to a publication they do not own,
        // even when they own some other publication.
        var owner = await RegisterUserAsync();
        await SeedPublicationOwnedByUserAsync(owner.UserId);
        var foreign = await SeedPublicationOwnedByRandomHostAsync();

        var res = await AuthedClient(owner).PostAsync("/api/ImagenesPublicacion",
            ImageBody(foreign.PublicacionId, "https://cdn.test/hijack.jpg"));
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    // ---- A-23: host reschedule of a dated experience -----------------------------

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Owner_ReprogramaFecha_MovesReservationsAndEmailsGuests()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-01-10", disponible: true, cupos: 6);
        var reservaId = await SeedReservaAsync(
            seed.PublicacionId, usuarioId: null, inicio: "2027-01-10", fin: "2027-01-10");

        var res = await AuthedClient(owner).PostAsync($"/api/Horario/{horarioId}/reprogramar",
            Json(new { nuevaFecha = "2027-02-15" }));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        using (var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync()))
        {
            Assert.Equal(1, doc.RootElement.GetProperty("reservasMovidas").GetInt32());
            // The move never depends on the email: with no SMTP in the test host
            // the send is attempted once and reported as failed.
            var enviados = doc.RootElement.GetProperty("correosEnviados").GetInt32();
            var fallidos = doc.RootElement.GetProperty("correosFallidos").GetInt32();
            Assert.Equal(1, enviados + fallidos);
        }

        await using var db = NewDb();
        var horario = await db.Horarios.AsNoTracking().FirstAsync(h => h.Id == horarioId);
        Assert.Equal(new DateOnly(2027, 2, 15), horario.Fecha);

        var reserva = await db.Reservas.AsNoTracking().FirstAsync(r => r.Id == reservaId);
        Assert.Equal(new DateOnly(2027, 2, 15), reserva.FechaInicio);
        Assert.Equal(new DateOnly(2027, 2, 15), reserva.FechaFin);
        Assert.True(reserva.CancelacionLibre);
        Assert.Equal(new DateOnly(2027, 1, 10), reserva.ReprogramadaDesde);
        Assert.NotNull(reserva.ReprogramadaEn);
        Assert.Null(reserva.FechaExpiracionGracia);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Reprogramar_DestinationWithActiveReservation_Returns409()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-03-10", disponible: true);
        await SeedReservaAsync(seed.PublicacionId, usuarioId: null, inicio: "2027-04-20", fin: "2027-04-20");

        var res = await AuthedClient(owner).PostAsync($"/api/Horario/{horarioId}/reprogramar",
            Json(new { nuevaFecha = "2027-04-20" }));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        await using var db = NewDb();
        var horario = await db.Horarios.AsNoTracking().FirstAsync(h => h.Id == horarioId);
        Assert.Equal(new DateOnly(2027, 3, 10), horario.Fecha); // unchanged
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Reprogramar_ExceedsCapacity_Returns409()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-05-10", disponible: true, cupos: 1);
        await SeedReservaAsync(seed.PublicacionId, usuarioId: null,
            inicio: "2027-05-10", fin: "2027-05-10", huespedes: 3);

        var res = await AuthedClient(owner).PostAsync($"/api/Horario/{horarioId}/reprogramar",
            Json(new { nuevaFecha = "2027-06-10" }));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Reprogramar_NonExperiencePublication_Returns400()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        await using (var db = NewDb())
        {
            var pub = await db.Publicaciones.FirstAsync(p => p.Id == seed.PublicacionId);
            pub.Tipo = "hospedaje";
            await db.SaveChangesAsync();
        }

        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-07-10", disponible: true);
        var res = await AuthedClient(owner).PostAsync($"/api/Horario/{horarioId}/reprogramar",
            Json(new { nuevaFecha = "2027-07-20" }));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Reprogramar_Anonymous401_NonOwner403()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-08-10", disponible: true);
        var body = Json(new { nuevaFecha = "2027-08-20" });

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PostAsync($"/api/Horario/{horarioId}/reprogramar", body)).StatusCode);

        var intruder = await RegisterUserAsync();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AuthedClient(intruder).PostAsync($"/api/Horario/{horarioId}/reprogramar", body)).StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task Reprogramar_MultipleSlotsOnSameDay_Returns409()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-09-10", disponible: true);
        await SeedDatedHorarioAsync(seed.PublicacionId, "2027-09-10", disponible: true);

        var res = await AuthedClient(owner).PostAsync($"/api/Horario/{horarioId}/reprogramar",
            Json(new { nuevaFecha = "2027-09-20" }));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task CancelacionLibre_LetsGuestDeclineMovedReservation_EvenOnExpiredWindow()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-10-10", disponible: true);

        // The guest owns the reservation; the host moves it onto today, so the
        // normal "date already passed/is today" cancel rule would block it. The
        // rescheduled flag must lift that restriction.
        var guest = await RegisterUserAsync();
        var reservaId = await SeedReservaAsync(seed.PublicacionId, guest.UserId,
            inicio: "2027-10-10", fin: "2027-10-10");

        var hoy = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd");
        await using (var db = NewDb())
        {
            var reserva = await db.Reservas.FirstAsync(r => r.Id == reservaId);
            reserva.FechaInicio = DateOnly.Parse(hoy);
            reserva.FechaFin = DateOnly.Parse(hoy);
            reserva.CancelacionLibre = true;
            await db.SaveChangesAsync();
        }

        var res = await AuthedClient(guest).PutAsync($"/api/Reserva/{reservaId}/cancelar", Json(new { }));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        await using (var db = NewDb())
        {
            Assert.Equal("cancelada", await db.Reservas.Where(r => r.Id == reservaId)
                .Select(r => r.Estado).FirstAsync());
        }

        // Regression: an untouched reservation on today's date still cannot cancel.
        var normalId = await SeedReservaAsync(seed.PublicacionId, guest.UserId, inicio: hoy, fin: hoy);
        var blocked = await AuthedClient(guest).PutAsync($"/api/Reserva/{normalId}/cancelar", Json(new { }));
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
    }

    // ---- A-23: guards on dates that already carry active reservations ------------

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task DeleteHorario_WithActiveReservation_Returns409()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-11-10", disponible: true);
        await SeedReservaAsync(seed.PublicacionId, usuarioId: null, inicio: "2027-11-10", fin: "2027-11-10");

        var res = await AuthedClient(owner).DeleteAsync($"/api/Horario/{horarioId}");
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        await using var db = NewDb();
        Assert.True(await db.Horarios.AnyAsync(h => h.Id == horarioId));
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task PutHorario_ChangingDateWithActiveReservation_Returns409()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var horarioId = await SeedDatedHorarioAsync(seed.PublicacionId, "2027-11-10", disponible: true);
        await SeedReservaAsync(seed.PublicacionId, usuarioId: null, inicio: "2027-11-10", fin: "2027-11-10");

        // Moving a booked slot through the plain CRUD must be refused: the guest
        // has to be notified, which only the reprogramar action does.
        var res = await AuthedClient(owner).PutAsync($"/api/Horario/{horarioId}",
            HorarioBody(seed.PublicacionId, "2027-12-10", disponible: true, cupos: null));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        // Blocking/slot edits for the same date stay allowed.
        var ok = await AuthedClient(owner).PutAsync($"/api/Horario/{horarioId}",
            HorarioBody(seed.PublicacionId, "2027-11-10", disponible: false, cupos: 2));
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Disponibilidad")]
    public async Task PublicationPut_RemovingDatedHorarioWithActiveReservation_Returns409()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        await SeedDatedHorarioAsync(seed.PublicacionId, "2027-11-10", disponible: true);
        await SeedReservaAsync(seed.PublicacionId, usuarioId: null, inicio: "2027-11-10", fin: "2027-11-10");

        var body = Json(new
        {
            id = seed.PublicacionId,
            anfitrionId = seed.AnfitrionId,
            categoriaId = seed.CategoriaId,
            titulo = "Ruta del café",
            descripcion = "Sin horarios",
            tipo = "experiencia",
            precioPorNoche = 50,
            capacidadMaxima = 6,
            horarios = Array.Empty<object>(),
            experiencia = Array.Empty<object>(),
            publicacionAmenidads = Array.Empty<object>(),
        });

        var res = await AuthedClient(owner).PutAsync($"/api/Publicacione/{seed.PublicacionId}", body);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        await using var db = NewDb();
        Assert.True(await db.Horarios.AnyAsync(h =>
            h.PublicacionId == seed.PublicacionId && h.Fecha == new DateOnly(2027, 11, 10)));
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

    private async Task<Session> RegisterUserAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Disp",
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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@disp.test".ToLowerInvariant();

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

    private static StringContent HorarioBody(int publicacionId, string fecha, bool? disponible, int? cupos) =>
        Json(new
        {
            publicacionId,
            fecha,
            horaInicio = "08:00:00",
            horaFin = "12:00:00",
            disponible,
            cupos,
        });

    private static StringContent ImageBody(int publicacionId, string url) =>
        Json(new
        {
            publicacionId,
            url,
            esPrincipal = false,
            orden = 0,
        });

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

    private async Task<int> SeedHostAsync(int? usuarioId, int municipioId)
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
            Descripcion = "Seeded for availability.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 6,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    private async Task<int> SeedDatedHorarioAsync(int publicacionId, string fecha, bool disponible, int? cupos = null)
    {
        await using var db = NewDb();
        var horario = new Horario
        {
            PublicacionId = publicacionId,
            Fecha = DateOnly.Parse(fecha),
            HoraInicio = new TimeOnly(8, 0),
            HoraFin = new TimeOnly(12, 0),
            Disponible = disponible,
            Cupos = cupos,
        };
        db.Horarios.Add(horario);
        await db.SaveChangesAsync();
        return horario.Id;
    }

    private async Task<int> SeedReservaAsync(int publicacionId, int? usuarioId, string inicio, string fin, int huespedes = 1)
    {
        var ini = DateOnly.Parse(inicio);
        var finD = DateOnly.Parse(fin);
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Disp Guest",
            EmailHuesped = NewEmail(),
            FechaInicio = ini,
            FechaFin = finD,
            NumeroHuespedes = huespedes,
            PrecioTotal = 50m * huespedes,
            Estado = "pendiente",
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task<int> SeedImageAsync(int publicacionId)
    {
        await using var db = NewDb();
        var imagen = new ImagenesPublicacion
        {
            PublicacionId = publicacionId,
            Url = "https://cdn.test/seed.jpg",
            EsPrincipal = true,
            Orden = 0,
        };
        db.ImagenesPublicacions.Add(imagen);
        await db.SaveChangesAsync();
        return imagen.Id;
    }

    private async Task<Seed> SeedPublicationOwnedByUserAsync(int usuarioId)
    {
        var (municipioId, categoriaId) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId, municipioId);
        var publicacionId = await SeedExperienciaAsync(anfitrionId, categoriaId);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId);
    }

    private async Task<Seed> SeedPublicationOwnedByRandomHostAsync()
    {
        var (municipioId, categoriaId) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId: null, municipioId);
        var publicacionId = await SeedExperienciaAsync(anfitrionId, categoriaId);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId);
    }
}
