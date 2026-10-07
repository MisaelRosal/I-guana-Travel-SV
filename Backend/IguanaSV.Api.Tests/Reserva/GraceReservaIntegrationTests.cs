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

namespace IguanaSV.Api.Tests.Gracia;

/// <summary>
/// Vertical integration slice for the one-hour grace window on short (&lt;24h)
/// reservations. Drives the real HTTP pipeline (cookie JWT + CSRF + [Authorize])
/// against the shared "AuthN" Testcontainers Postgres collection. Proves that:
///   * a short reservation (check-in today/tomorrow) persists a non-null grace
///     expiry (~now+1h) while a far reservation stores NULL;
///   * inside grace, edit/pay/cancel all succeed;
///   * once grace lapses, edit/cancel/pay are refused and the background
///     <see cref="GraceExpirationService"/> auto-cancels the row;
///   * a paid (confirmada) short reservation can no longer be edited/cancelled;
///   * far reservations keep the legacy date-based rules untouched.
/// </summary>
[Collection("AuthN")]
public sealed class GraceReservaIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public GraceReservaIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: grace integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Requirement: short vs far classification on create ----------------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task PostShortReservation_SetsGraceWindow_AndFarReservationLeavesNull()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var before = DateTime.Now;
        var shortRes = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Grace Short",
            emailHuesped = user.Email,
            fechaInicio = Iso(0),
            fechaFin = Iso(1),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, shortRes.StatusCode);
        var shortId = ReadId(shortRes);
        var after = DateTime.Now;

        var grace = await ReadGraceAsync(shortId);
        Assert.NotNull(grace);
        // ~now+1h with a generous tolerance for scheduling jitter.
        Assert.True(grace!.Value >= before.AddHours(1).AddMinutes(-2), "grace expiry is not ~now+1h");
        Assert.True(grace.Value <= after.AddHours(1).AddMinutes(2), "grace expiry is not ~now+1h");

        var farRes = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Grace Far",
            emailHuesped = "far-grace@reserva.test",
            fechaInicio = Iso(20),
            fechaFin = Iso(23),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, farRes.StatusCode);
        Assert.Null(await ReadGraceAsync(ReadId(farRes)));
    }

    // ---- Requirement: inside grace, all mutations stay allowed -------------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task ShortReservation_InGrace_EditAllowed()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await PostShortReservationAsync(user, pubId, Iso(0), Iso(1));

        // Editing a short reservation inside grace must succeed (no "1 day" block).
        var res = await AuthedClient(user).PutAsync($"/api/Reserva/{reservaId}", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Grace Edited",
            emailHuesped = user.Email,
            fechaInicio = Iso(1),
            fechaFin = Iso(2),
            numeroHuespedes = 1,
        }));

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task ShortReservation_InGrace_PayConfirms()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await PostShortReservationAsync(user, pubId, Iso(0), Iso(1));

        var res = await AuthedClient(user)
            .PutAsync($"/api/Reserva/{reservaId}/pagar", Json(new { metodoPago = "card" }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("confirmada", await ReadEstadoAsync(reservaId));
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task ShortReservation_InGrace_CancelAllowed()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await PostShortReservationAsync(user, pubId, Iso(1), Iso(2));

        var res = await AuthedClient(user).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("cancelada", await ReadEstadoAsync(reservaId));
    }

    // ---- Requirement: expired grace blocks everything and auto-cancels ------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task ShortReservation_ExpiredGrace_BlocksEditCancelPay_AndServiceCancels()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await PostShortReservationAsync(user, pubId, Iso(0), Iso(1));

        // Push the grace expiry into the past directly in the database.
        await SetGraceAsync(reservaId, DateTime.Now.AddMinutes(-5));

        var edit = await AuthedClient(user).PutAsync($"/api/Reserva/{reservaId}", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Grace Late",
            emailHuesped = user.Email,
            fechaInicio = Iso(1),
            fechaFin = Iso(2),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.BadRequest, edit.StatusCode);

        var cancel = await AuthedClient(user).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.BadRequest, cancel.StatusCode);

        var pay = await AuthedClient(user)
            .PutAsync($"/api/Reserva/{reservaId}/pagar", Json(new { metodoPago = "card" }));
        Assert.Equal(HttpStatusCode.BadRequest, pay.StatusCode);

        // Still pending until the background service runs its pass.
        Assert.Equal("pendiente", await ReadEstadoAsync(reservaId));

        var scopeFactory = _factory.Services.GetRequiredService<IServiceScopeFactory>();
        var service = new GraceExpirationService(scopeFactory, NullLogger<GraceExpirationService>.Instance);
        await service.ExpireOverdueAsync(CancellationToken.None);

        Assert.Equal("cancelada", await ReadEstadoAsync(reservaId));
    }

    // ---- Requirement: a paid short reservation is locked ---------------------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task ShortReservation_Paid_EditAndCancelBlockedWithMessage()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await PostShortReservationAsync(user, pubId, Iso(0), Iso(1));

        var pay = await AuthedClient(user)
            .PutAsync($"/api/Reserva/{reservaId}/pagar", Json(new { metodoPago = "card" }));
        Assert.Equal(HttpStatusCode.OK, pay.StatusCode);
        Assert.Equal("confirmada", await ReadEstadoAsync(reservaId));

        var edit = await AuthedClient(user).PutAsync($"/api/Reserva/{reservaId}", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Grace Paid",
            emailHuesped = user.Email,
            fechaInicio = Iso(1),
            fechaFin = Iso(2),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.BadRequest, edit.StatusCode);
        Assert.Contains("ya pagaste", await edit.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

        var cancel = await AuthedClient(user).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.BadRequest, cancel.StatusCode);
    }

    // ---- Requirement: far reservations keep the legacy date-based rules -----------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task FarReservation_LegacyDateRulesIntact()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        // Seeded directly (NULL grace) so the legacy rules, not grace, apply.
        var boundaryId = await SeedFarReservaAsync(pubId, user.UserId, Iso(1), Iso(2));  // check-in tomorrow
        var todayId = await SeedFarReservaAsync(pubId, user.UserId, Iso(0), Iso(1));     // check-in today
        var futureId = await SeedFarReservaAsync(pubId, user.UserId, Iso(10), Iso(12));  // check-in far out

        // tomorrow: edit/delete blocked (<= today+1), cancel allowed (tomorrow > today).
        var editBoundary = await AuthedClient(user).PutAsync($"/api/Reserva/{boundaryId}", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Legacy Tomorrow",
            emailHuesped = user.Email,
            fechaInicio = Iso(2),
            fechaFin = Iso(3),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.BadRequest, editBoundary.StatusCode);

        var deleteBoundary = await AuthedClient(user).DeleteAsync($"/api/Reserva/{boundaryId}");
        Assert.Equal(HttpStatusCode.BadRequest, deleteBoundary.StatusCode);

        // today: cancel blocked (<= today).
        var cancelToday = await AuthedClient(user).PutAsync($"/api/Reserva/{todayId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.BadRequest, cancelToday.StatusCode);

        // far out: edit allowed.
        var editFuture = await AuthedClient(user).PutAsync($"/api/Reserva/{futureId}", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Legacy Far",
            emailHuesped = user.Email,
            fechaInicio = Iso(11),
            fechaFin = Iso(13),
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.NoContent, editFuture.StatusCode);
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
            nombre = "Gracia",
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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@gracia.test".ToLowerInvariant();

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
        var departamento = new Departamento { Nombre = $"GDep {tag}" };
        var municipio = new Municipio { Nombre = $"GMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"GHost {tag}",
            Email = $"host{tag}@gracia.test".ToLowerInvariant(),
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
        var categoria = new Categoria { Nombre = $"GCat {tag}", Tipo = tipo };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = tipo,
            Titulo = $"Grace {tag}",
            Descripcion = "Seeded by the grace slice.",
            PrecioPorNoche = precioPorNoche,
            CapacidadMaxima = capacidad,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    /// <summary>Creates a short reservation through the HTTP pipeline.</summary>
    private async Task<int> PostShortReservationAsync(Session user, int pubId, string inicio, string fin)
    {
        var res = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Grace Guest",
            emailHuesped = user.Email,
            fechaInicio = inicio,
            fechaFin = fin,
            numeroHuespedes = 1,
        }));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return ReadId(res);
    }

    /// <summary>Seeds a reservation directly with a NULL grace expiry (far case).</summary>
    private async Task<int> SeedFarReservaAsync(int publicacionId, int? usuarioId, string inicio, string fin)
    {
        var ini = DateOnly.Parse(inicio);
        var finD = DateOnly.Parse(fin);
        var nights = Math.Max(1, finD.DayNumber - ini.DayNumber);
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Far Guest",
            EmailHuesped = NewEmail(),
            FechaInicio = ini,
            FechaFin = finD,
            NumeroHuespedes = 1,
            PrecioTotal = 100m * nights,
            Estado = "pendiente",
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task<DateTime?> ReadGraceAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.FechaExpiracionGracia).FirstAsync();
    }

    private async Task SetGraceAsync(int id, DateTime value)
    {
        await using var db = NewDb();
        var reserva = await db.Reservas.FindAsync(id)
            ?? throw new InvalidOperationException($"Reserva {id} not found.");
        reserva.FechaExpiracionGracia = value;
        await db.SaveChangesAsync();
    }

    private async Task<string?> ReadEstadoAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.Estado).FirstAsync();
    }
}
