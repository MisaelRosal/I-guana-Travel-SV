using System.Net;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace IguanaSV.Api.Tests.Overlap;

/// <summary>
/// Vertical integration slice for the <c>no-double-booking</c> capability (W5).
/// Drives the real HTTP pipeline (W3a cookie JWT + CSRF, W3b [Authorize], W4
/// DTO binding/price recompute) against the SAME ephemeral Testcontainers
/// Postgres as the other API slices (shared "AuthN" collection fixture), whose
/// <c>Database.MigrateAsync()</c> applies M3 and therefore creates the
/// <c>reservas_no_overlap_lodging</c> EXCLUDE constraint for real.
///
/// It proves the half-open [check-in, check-out) semantics end-to-end:
///   * adjacency (A.checkout == B.checkin) is allowed — both 201;
///   * a genuine overlap is refused — 409 (never 500);
///   * the refusal holds under real concurrency (two racing POSTs);
///   * a cancelled reservation does not block a later one in the same range;
///   * a database exclusion violation is mapped to 409, not a 500;
///   * experience slot capacity is enforced per horario (TD3) with 409 on overflow.
/// Traces: no-double-booking spec (all four requirements) · design TD2/TD3.
/// </summary>
[Collection("AuthN")]
public sealed class OverlapIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public OverlapIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: overlap integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Requirement: lodging overlap excluded, half-open [) (TD2) --------------

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task AdjacentRanges_BothSucceed()
    {
        // A: [t+10, t+13); B: [t+13, t+15). B starts exactly on A's checkout day.
        // Under [check-in, check-out) the two dateranges are disjoint, so BOTH
        // must be accepted. This is the "Adjacent range allowed" spec scenario.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var a = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Adjacent A",
            emailHuesped = host.Email,
            fechaInicio = Iso(10),
            fechaFin = Iso(13),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, a.StatusCode);

        var b = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Adjacent B",
            emailHuesped = "b.adj@overlap.test",
            fechaInicio = Iso(13),
            fechaFin = Iso(15),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, b.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task OverlappingRange_SecondReturns409_WithMessage()
    {
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var first = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Blocker",
            emailHuesped = host.Email,
            fechaInicio = Iso(20),
            fechaFin = Iso(25),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var overlapping = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Overlap",
            emailHuesped = "ov@overlap.test",
            fechaInicio = Iso(22), // inside [20,25)
            fechaFin = Iso(27),
            numeroHuespedes = 1,
        }));

        Assert.Equal(HttpStatusCode.Conflict, overlapping.StatusCode);
        var body = await overlapping.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("mensaje").GetString()));
    }

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task ConcurrentOverlap_ExactlyOneCreatedOneConflict()
    {
        // Two independent clients (separate request scopes / DbContexts) race for
        // the SAME publication and identical overlapping dates. The application
        // pre-check is inherently racy, so the database EXCLUDE is the tie-breaker:
        // exactly one 201 and exactly one 409 (the loser never sees a 500). This
        // is the "Concurrent overlap rejected" spec scenario at the API boundary.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        async Task<HttpStatusCode> Post(string email)
        {
            var client = AuthedClient(host);
            var res = await client.PostAsync("/api/Reserva", Json(new
            {
                publicacionId = pubId,
                nombreHuesped = "Racer",
                emailHuesped = email,
                fechaInicio = Iso(40),
                fechaFin = Iso(45),
                numeroHuespedes = 1,
            }));
            return res.StatusCode;
        }

        var results = await Task.WhenAll(
            Post("race1@overlap.test"),
            Post("race2@overlap.test"),
            Post("race3@overlap.test"),
            Post("race4@overlap.test"));

        Assert.Equal(1, results.Count(s => s == HttpStatusCode.Created));
        Assert.Equal(3, results.Count(s => s == HttpStatusCode.Conflict));
    }

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task CancelledReservation_DoesNotBlockSameRange()
    {
        // Seed an ACTIVE reservation, cancel it, then re-book the same range: the
        // cancelled row is excluded by the partial predicate, so the new booking
        // must be accepted. This is the "Cancelled reservation does not block"
        // spec scenario.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        // Seed an active reservation for [t+50, t+55) and then cancel it. A
        // cancelled row is outside the EXCLUDE predicate, so re-booking the exact
        // same range must succeed.
        var blockerId = await SeedPendingReservaAsync(pubId, Iso(50), Iso(55));
        await SetEstadoAsync(blockerId, "cancelada");

        var rebook = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "After Cancel",
            emailHuesped = "ac@overlap.test",
            fechaInicio = Iso(50),
            fechaFin = Iso(55),
            numeroHuespedes = 1,
        }));

        Assert.Equal(HttpStatusCode.Created, rebook.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task ExclusionViolation_MapsTo409_Not500()
    {
        // Deterministically force the database (not the friendly pre-check) to
        // reject the insert. A reservation stored with a NULL estado is "active"
        // for the EXCLUDE (estado IS DISTINCT FROM 'cancelada' is true for NULL),
        // but the application pre-check filters with estado <> 'cancelada', which
        // does not surface NULL rows. The insert therefore reaches the database and
        // is rejected with SQLSTATE 23P01; the controller maps it to 409. A 500
        // would fail this assertion.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        await SeedReservaWithEstadoNullAsync(pubId, Iso(60), Iso(65));

        var res = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Should Conflict At DB",
            emailHuesped = "db@overlap.test",
            fechaInicio = Iso(62), // overlaps the NULL-estado row [60,65)
            fechaFin = Iso(67),
            numeroHuespedes = 1,
        }));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    // ---- Requirement: experience slot capacity per horario (TD3) ----------------

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task ExperienceSlotCapacity_OverMax_Returns409()
    {
        // Capacity is a count over active reservations linked to a slot, enforced
        // under pg_advisory_xact_lock(horario_id). Two experiences of 3 guests each
        // against a slot on a publication whose capacidad_maxima is 4: the first
        // link is accepted (0+3 <= 4), the second is refused (3+3 > 4) with a 409.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "experiencia",
            precioPorNoche: 50m, capacidad: 4);
        var horarioId = await SeedHorarioAsync(pubId, Iso(70));

        var r1 = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Group One",
            emailHuesped = host.Email,
            fechaInicio = Iso(70),
            fechaFin = Iso(70),
            numeroHuespedes = 3,
        }));
        Assert.Equal(HttpStatusCode.Created, r1.StatusCode);
        var id1 = ReadId(r1);

        var r2 = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Group Two",
            emailHuesped = "g2@overlap.test",
            fechaInicio = Iso(70),
            fechaFin = Iso(70),
            numeroHuespedes = 3,
        }));
        Assert.Equal(HttpStatusCode.Created, r2.StatusCode);
        var id2 = ReadId(r2);

        var link1 = await AuthedClient(host).PostAsync("/api/ReservaHorario", Json(new
        {
            reservaId = id1,
            horarioId,
        }));
        Assert.Equal(HttpStatusCode.Created, link1.StatusCode);

        var link2 = await AuthedClient(host).PostAsync("/api/ReservaHorario", Json(new
        {
            reservaId = id2,
            horarioId,
        }));
        Assert.Equal(HttpStatusCode.Conflict, link2.StatusCode);
    }

    // ---- helpers -----------------------------------------------------------------

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
            nombre = "Overlap",
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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@overlap.test".ToLowerInvariant();

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

    private static int ReadId(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        return doc.RootElement.GetProperty("id").GetInt32();
    }

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
        var departamento = new Departamento { Nombre = $"ODep {tag}" };
        var municipio = new Municipio { Nombre = $"OMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"OHost {tag}",
            Email = $"host{tag}@overlap.test".ToLowerInvariant(),
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
        var categoria = new Categoria { Nombre = $"OCat {tag}", Tipo = tipo };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = tipo,
            Titulo = $"Overlap {tag}",
            Descripcion = "Seeded by the W5 overlap slice.",
            PrecioPorNoche = precioPorNoche,
            CapacidadMaxima = capacidad,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    private async Task<int> SeedHorarioAsync(int publicacionId, string fecha)
    {
        await using var db = NewDb();
        var horario = new Horario
        {
            PublicacionId = publicacionId,
            Fecha = DateOnly.Parse(fecha),
            HoraInicio = new TimeOnly(8, 0),
            HoraFin = new TimeOnly(10, 0),
            Disponible = true,
        };
        db.Horarios.Add(horario);
        await db.SaveChangesAsync();
        return horario.Id;
    }

    private async Task<int> SeedPendingReservaAsync(int publicacionId, string inicio, string fin)
    {
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = null,
            NombreHuesped = "Seed Guest",
            EmailHuesped = NewEmail(),
            FechaInicio = DateOnly.Parse(inicio),
            FechaFin = DateOnly.Parse(fin),
            NumeroHuespedes = 1,
            PrecioTotal = 100m,
            Estado = "pendiente",
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task SetEstadoAsync(int reservaId, string estado)
    {
        await using var db = new NpgsqlConnection(_fixture.ConnectionString!);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand("UPDATE reservas SET estado = @e WHERE id = @id;", db);
        cmd.Parameters.AddWithValue("e", estado);
        cmd.Parameters.AddWithValue("id", reservaId);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Insert a reservation with an explicit NULL estado, bypassing EF so the row
    /// is invisible to the <c>estado &lt;&gt; 'cancelada'</c> pre-check but still
    /// active for the EXCLUDE's <c>estado IS DISTINCT FROM 'cancelada'</c>.
    /// </summary>
    private async Task SeedReservaWithEstadoNullAsync(int publicacionId, string inicio, string fin)
    {
        await using var db = new NpgsqlConnection(_fixture.ConnectionString!);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO reservas
                (publicacion_id, nombre_huesped, email_huesped, fecha_inicio, fecha_fin, numero_huespedes, precio_total, estado)
            VALUES
                (@pid, 'Null Estado', @email, @ini::date, @fin::date, 1, 100.00, NULL);
            """, db);
        cmd.Parameters.AddWithValue("pid", publicacionId);
        cmd.Parameters.AddWithValue("email", NewEmail());
        cmd.Parameters.AddWithValue("ini", inicio);
        cmd.Parameters.AddWithValue("fin", fin);
        await cmd.ExecuteNonQueryAsync();
    }
}
