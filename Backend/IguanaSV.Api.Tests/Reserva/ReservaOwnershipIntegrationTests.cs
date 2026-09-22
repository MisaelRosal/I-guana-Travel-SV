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

namespace IguanaSV.Api.Tests.ReservaOwnership;

/// <summary>
/// Vertical integration slice for the <c>reserva-ownership-enforcement</c>
/// capability (W4). Drives the real pipeline (cookie JWT from W3a + CSRF gate +
/// the [Authorize] matrix from W3b) over HTTP against the same ephemeral
/// Testcontainers Postgres as the AuthN/AuthZ slices (shared "AuthN" collection
/// fixture). Proves, end-to-end, that <c>/api/Reserva</c> now binds
/// <see cref="IguanaSV.Api.Models.CreateReservaDto"/> (validator live), recomputes
/// <c>PrecioTotal</c> from the publication, derives <c>UsuarioId</c> from the token
/// subject, scopes reads to the caller (admins see all, orphans hidden), and keeps
/// the owner-or-admin mutation gates intact.
/// Traces: reserva-ownership-enforcement spec requirements "DTO binding and live
/// validator", "Server-side price recompute", "Owner derived from token",
/// "Owner-scoped reads", "IDOR closure on reservation mutations".
/// </summary>
[Collection("AuthN")]
public sealed class ReservaOwnershipIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public ReservaOwnershipIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: Reserva integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Requirement: Server-side price recompute + Owner derived from token ----

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task PostLodging_RecomputesPriceAndIgnoresClientPrecio()
    {
        // Publication priced at 100/night; a 3-night range must persist 300 even
        // though the client lowballs the body with precioTotal = 0.01.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var (inicio, fin) = FutureRange(10, 3); // [today+10, today+13) => 3 nights
        var res = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Alice Traveler",
            emailHuesped = host.Email,
            telefonoHuesped = "503-1111-2222",
            fechaInicio = inicio,
            fechaFin = fin,
            numeroHuespedes = 1,
            precioTotal = 0.01, // mass-assignment attempt: must be ignored
        }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = ReadId(res);
        Assert.Equal(300m, await ReadPrecioTotalAsync(id));
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task Post_BindsDto_SetsOwnerFromToken_PinsPendiente_IgnoresBodyIdAndEstado()
    {
        var user = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(user.UserId), tipo: "hospedaje",
            precioPorNoche: 80m, capacidad: 4);

        var (inicio, fin) = FutureRange(20, 2); // 2 nights => 160
        var res = await AuthedClient(user).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Bob Traveler",
            emailHuesped = user.Email,
            fechaInicio = inicio,
            fechaFin = fin,
            numeroHuespedes = 1,
            usuarioId = 999999,     // must be ignored -> token sub wins
            estado = "completada",  // must be ignored -> server pins pendiente
        }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = ReadId(res);

        // DTO binding means the entity-only fields never round-trip from the body.
        Assert.Equal(user.UserId, await ReadUsuarioIdAsync(id));
        Assert.Equal("pendiente", await ReadEstadoAsync(id));
        Assert.Equal(160m, await ReadPrecioTotalAsync(id));
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task PostExperience_PricesPerPersonFromPublication()
    {
        // Experience without an add-on row: (precioPorNoche + precioAdicional=0)
        // per guest; the spec leaves the experience formula open, so the wave
        // directive fixes it to guests × (precio_por_noche + precio_adicional).
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "experiencia",
            precioPorNoche: 50m, capacidad: 10);

        var (inicio, _) = FutureRange(5, 0); // same-day experience
        var res = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Cari Group",
            emailHuesped = host.Email,
            fechaInicio = inicio,
            fechaFin = inicio,
            numeroHuespedes = 3,
            precioTotal = 0.01,
        }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = ReadId(res);
        Assert.Equal(150m, await ReadPrecioTotalAsync(id)); // (50 + 0) * 3 people
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task PostExperience_AddsPrecioAdicionalPerGuest()
    {
        // With an experiencias.precio_adicional row the unit price charged once
        // per guest becomes precioPorNoche + PrecioAdicional: (50 + 10) * 3 = 180.
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "experiencia",
            precioPorNoche: 50m, capacidad: 10, precioAdicional: 10m);

        var (inicio, _) = FutureRange(6, 0);
        var res = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Dana Group",
            emailHuesped = host.Email,
            fechaInicio = inicio,
            fechaFin = inicio,
            numeroHuespedes = 3,
        }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = ReadId(res);
        Assert.Equal(180m, await ReadPrecioTotalAsync(id));
    }

    // ---- Requirement: DTO binding and live validator -----------------------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task Post_InvalidGuestEmail_Returns400AndDoesNotPersist()
    {
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var (inicio, fin) = FutureRange(15, 2);
        var res = await AuthedClient(host).PostAsync("/api/Reserva", Json(new
        {
            publicacionId = pubId,
            nombreHuesped = "Bad Email",
            emailHuesped = "this-is-not-an-email",
            fechaInicio = inicio,
            fechaFin = fin,
            numeroHuespedes = 1,
        }));

        // The validator only runs because the action now binds CreateReservaDto.
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(0, await CountReservasForPublicationAsync(pubId));
    }

    // ---- Requirement: Owner-scoped reads (PII leak closure) ----------------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task GetList_ScopedToOwner_AdminSeesAll_OrphanHidden()
    {
        var userA = await RegisterUserAsync();
        var userB = await RegisterUserAsync();
        var pubA = await SeedPublicationAsync(await SeedHostIdAsync(userA.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var pubB = await SeedPublicationAsync(await SeedHostIdAsync(userB.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);

        var reservaA = await SeedPendingReservaAsync(pubA, userA.UserId, FutureRange(40, 2));
        var reservaB = await SeedPendingReservaAsync(pubB, userB.UserId, FutureRange(60, 2));
        var orphan = await SeedPendingReservaAsync(pubA, usuarioId: null, FutureRange(80, 2));

        // A sees only their own row.
        var aIds = await ListIdsAsync(AuthedClient(userA));
        Assert.Contains(reservaA, aIds);
        Assert.DoesNotContain(reservaB, aIds);
        Assert.DoesNotContain(orphan, aIds); // orphan-NULL hidden from non-admins

        // Admin sees every row, including the orphan.
        var adminIds = await ListIdsAsync(AuthedClient(AdminSession()));
        Assert.Contains(reservaA, adminIds);
        Assert.Contains(reservaB, adminIds);
        Assert.Contains(orphan, adminIds);
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task GetById_NonOwner404_OwnerAndAdmin200()
    {
        var owner = await RegisterUserAsync();
        var pub = await SeedPublicationAsync(await SeedHostIdAsync(owner.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await SeedPendingReservaAsync(pub, owner.UserId, FutureRange(50, 2));

        var stranger = await RegisterUserAsync();

        // 404 (not 403) so the existence of someone else's row is not leaked.
        var strangerRes = await AuthedClient(stranger).GetAsync($"/api/Reserva/{reservaId}");
        Assert.Equal(HttpStatusCode.NotFound, strangerRes.StatusCode);

        var ownerRes = await AuthedClient(owner).GetAsync($"/api/Reserva/{reservaId}");
        Assert.Equal(HttpStatusCode.OK, ownerRes.StatusCode);

        var adminRes = await AuthedClient(AdminSession()).GetAsync($"/api/Reserva/{reservaId}");
        Assert.Equal(HttpStatusCode.OK, adminRes.StatusCode);
    }

    // ---- PUT: DTO binding, recompute, no UsuarioId/Estado change -----------------

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task PutRecomputesPrice_AndCannotChangeOwnerEstadoOrPublication()
    {
        var owner = await RegisterUserAsync();
        var pub = await SeedPublicationAsync(await SeedHostIdAsync(owner.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        // Seeded far in the future so the "must be > 1 day out" edit rule passes.
        var reservaId = await SeedPendingReservaAsync(pub, owner.UserId, FutureRange(30, 3));

        // Foreign publication the attacker tries to reparent onto.
        var victim = await RegisterUserAsync();
        var foreignPub = await SeedPublicationAsync(await SeedHostIdAsync(victim.UserId), tipo: "hospedaje",
            precioPorNoche: 7m, capacidad: 4);

        var (nuevoInicio, nuevoFin) = FutureRange(100, 2); // 2 nights => 200
        var res = await AuthedClient(owner).PutAsync($"/api/Reserva/{reservaId}", Json(new
        {
            id = reservaId,
            publicacionId = foreignPub, // must be ignored -> stays on original pub
            nombreHuesped = "Owner Renamed",
            emailHuesped = owner.Email,
            fechaInicio = nuevoInicio,
            fechaFin = nuevoFin,
            numeroHuespedes = 1,
            usuarioId = 999999,        // must be ignored
            estado = "completada",     // must be ignored
            precioTotal = 0.01,        // must be recomputed
        }));

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        Assert.Equal(200m, await ReadPrecioTotalAsync(reservaId));       // recomputed (100 * 2)
        Assert.Equal(owner.UserId, await ReadUsuarioIdAsync(reservaId)); // unchanged
        Assert.Equal("pendiente", await ReadEstadoAsync(reservaId));     // unchanged
        Assert.Equal(pub, await ReadPublicacionIdAsync(reservaId));      // no reparenting
    }

    // ---- Mutation gates still resolve ownership; payment stays authoritative -----

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task Cancelar_StrangerForbiddenAndUnchanged_OwnerAllowed()
    {
        var owner = await RegisterUserAsync();
        var pub = await SeedPublicationAsync(await SeedHostIdAsync(owner.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        var reservaId = await SeedPendingReservaAsync(pub, owner.UserId, FutureRange(45, 2));

        var stranger = await RegisterUserAsync();
        var strangerRes = await AuthedClient(stranger).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, strangerRes.StatusCode);
        Assert.Equal("pendiente", await ReadEstadoAsync(reservaId)); // row unchanged

        var ownerRes = await AuthedClient(owner).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.OK, ownerRes.StatusCode);
        Assert.Equal("cancelada", await ReadEstadoAsync(reservaId));
    }

    [SkippableFact]
    [Trait("Category", "Reserva")]
    public async Task Pagar_StrangerForbidden_OwnerConfirmsWithoutTouchingAuthoritativePrice()
    {
        var owner = await RegisterUserAsync();
        var pub = await SeedPublicationAsync(await SeedHostIdAsync(owner.UserId), tipo: "hospedaje",
            precioPorNoche: 100m, capacidad: 4);
        // Autoritative price already set to 100*2 = 200 by the seed.
        var reservaId = await SeedPendingReservaAsync(pub, owner.UserId, FutureRange(70, 2));

        var stranger = await RegisterUserAsync();
        var strangerRes = await AuthedClient(stranger)
            .PutAsync($"/api/Reserva/{reservaId}/pagar", Json(new { metodoPago = "card" }));
        Assert.Equal(HttpStatusCode.Forbidden, strangerRes.StatusCode);

        var ownerRes = await AuthedClient(owner)
            .PutAsync($"/api/Reserva/{reservaId}/pagar", Json(new { metodoPago = "card" }));
        Assert.Equal(HttpStatusCode.OK, ownerRes.StatusCode);
        Assert.Equal("confirmada", await ReadEstadoAsync(reservaId));
        Assert.Equal("card", await ReadMetodoPagoAsync(reservaId));
        Assert.Equal(200m, await ReadPrecioTotalAsync(reservaId)); // not recomputed on client value
        Assert.Equal(owner.UserId, await ReadUsuarioIdAsync(reservaId));
    }

    // ---- helpers -----------------------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

    private HttpClient Client() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false, // drive cookies explicitly (same contract as the AuthN/AuthZ slices)
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
            nombre = "Reserva",
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
        new(UserId: 0, Email: "admin@reserva.test", Auth: MintToken("0", "admin"), Csrf: NewCsrf());

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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@reserva.test".ToLowerInvariant();

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

    /// <summary>A future, non-overlapping date range as ISO (yyyy-MM-dd) strings.</summary>
    private static (string Inicio, string Fin) FutureRange(int startOffsetDays, int nights)
    {
        var inicio = DateOnly.FromDateTime(DateTime.Today).AddDays(startOffsetDays);
        var fin = inicio.AddDays(nights);
        return (inicio.ToString("yyyy-MM-dd"), fin.ToString("yyyy-MM-dd"));
    }

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    /// <summary>Create a host row owned by <paramref name="usuarioId"/> (with a fresh municipio).</summary>
    private async Task<int> SeedHostIdAsync(int usuarioId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var departamento = new Departamento { Nombre = $"RDep {tag}" };
        var municipio = new Municipio { Nombre = $"RMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"RHost {tag}",
            Email = $"host{tag}@reserva.test".ToLowerInvariant(),
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    /// <summary>
    /// A fresh publication (its own categoria) owned by the given host. When
    /// <paramref name="precioAdicional"/> is set, an experiencias row is attached
    /// so the W4 experience price formula reads it from the database.
    /// </summary>
    private async Task<int> SeedPublicationAsync(
        int anfitrionId, string tipo, decimal precioPorNoche, int capacidad,
        decimal? precioAdicional = null)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var categoria = new Categoria { Nombre = $"RCat {tag}", Tipo = tipo };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = tipo,
            Titulo = $"Reserva W4 {tag}",
            Descripcion = "Seeded by the Reserva W4 slice.",
            PrecioPorNoche = precioPorNoche,
            CapacidadMaxima = capacidad,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();

        if (precioAdicional.HasValue)
        {
            db.Experiencias.Add(new Experiencia
            {
                PublicacionId = publicacion.Id,
                Nombre = $"Reserva W4 exp {tag}",
                PrecioAdicional = precioAdicional.Value,
            });
            await db.SaveChangesAsync();
        }

        return publicacion.Id;
    }

    /// <summary>Seed a pending reservation with an explicit authoritative price (precioPorNoche 100 * nights).</summary>
    private async Task<int> SeedPendingReservaAsync(int publicacionId, int? usuarioId, (string Inicio, string Fin) range)
    {
        var inicio = DateOnly.Parse(range.Inicio);
        var fin = DateOnly.Parse(range.Fin);
        var nights = Math.Max(1, fin.DayNumber - inicio.DayNumber);
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Seed Guest",
            EmailHuesped = NewEmail(),
            FechaInicio = inicio,
            FechaFin = fin,
            NumeroHuespedes = 1,
            PrecioTotal = 100m * nights,
            Estado = "pendiente",
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task<List<int>> ListIdsAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/Reserva");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.EnumerateArray()
            .Select(e => e.GetProperty("id").GetInt32())
            .ToList();
    }

    private async Task<decimal> ReadPrecioTotalAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.PrecioTotal).FirstAsync();
    }

    private async Task<int?> ReadUsuarioIdAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.UsuarioId).FirstAsync();
    }

    private async Task<string?> ReadEstadoAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.Estado).FirstAsync();
    }

    private async Task<int> ReadPublicacionIdAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.PublicacionId).FirstAsync();
    }

    private async Task<string?> ReadMetodoPagoAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.MetodoPago).FirstAsync();
    }

    private async Task<int> CountReservasForPublicationAsync(int publicacionId)
    {
        await using var db = NewDb();
        return await db.Reservas.CountAsync(r => r.PublicacionId == publicacionId);
    }
}
