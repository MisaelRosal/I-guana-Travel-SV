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

namespace IguanaSV.Api.Tests.AuthZ;

/// <summary>
/// Vertical integration slice for the <c>authz-roles-ownership</c> capability.
/// Every scenario drives the real pipeline (cookie JWT from W3a + CSRF gate +
/// the new [Authorize] matrix) over HTTP against the same ephemeral
/// Testcontainers Postgres as the AuthN slice (shared collection fixture).
/// Identity comes from three sources on purpose: real register/login sessions
/// (usuario), hand-minted tokens with a chosen <c>rol</c> claim (anfitrion,
/// admin), and no cookies at all (anonymous) — mirroring the spec's matrix of
/// 401 / 403 / 2xx expectations. DB rows needed by the ownership gates are
/// seeded directly through <see cref="IguanasDbContext"/>.
/// Traces: authz-roles-ownership spec requirements "Public read, protected
/// write", "Host verification is admin-only", "Role changes are admin-only",
/// "Registrar binds identity from the token", "Publication ownership gate",
/// "Host and image destructive routes authenticated".
/// </summary>
[Collection("AuthN")]
public sealed class AuthzIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public AuthzIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: AuthZ integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Requirement: Public read, protected write -----------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task AnonymousPublicationMutations_Returns401()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();

        var anon = Client();
        var delete = await anon.DeleteAsync($"/api/Publicacione/{seed.PublicacionId}");
        Assert.Equal(HttpStatusCode.Unauthorized, delete.StatusCode);

        var post = await Client().PostAsync("/api/Publicacione", PublicationBody(seed.AnfitrionId, seed.CategoriaId));
        Assert.Equal(HttpStatusCode.Unauthorized, post.StatusCode);

        var put = await Client().PutAsync($"/api/Publicacione/{seed.PublicacionId}",
            PublicationBody(seed.AnfitrionId, seed.CategoriaId));
        Assert.Equal(HttpStatusCode.Unauthorized, put.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task AnonymousDestructiveUploadAndHostRoutes_Returns401()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();

        // Spec scenario: anonymous asset delete -> 401.
        var imgDelete = await Client().DeleteAsync("/api/Imagenes/whatever.png");
        Assert.Equal(HttpStatusCode.Unauthorized, imgDelete.StatusCode);

        // Spec scenario: upload write route must require a session.
        var upload = await Client().PostAsync("/api/Imagenes/upload",
            new MultipartFormDataContent());
        Assert.Equal(HttpStatusCode.Unauthorized, upload.StatusCode);

        var registrar = await Client().PostAsync("/api/Anfitrione/registrar", Json(new
        {
            municipioId = seed.MunicipioId,
            nombre = "Ghost Host",
            email = NewEmail(),
        }));
        Assert.Equal(HttpStatusCode.Unauthorized, registrar.StatusCode);

        // The historically-public admin route.
        var verificacion = await Client().PutAsync($"/api/Anfitrione/{seed.AnfitrionId}/verificacion", Json(true));
        Assert.Equal(HttpStatusCode.Unauthorized, verificacion.StatusCode);

        var reservaPut = await Client().PutAsync($"/api/Reserva/{seed.ReservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, reservaPut.StatusCode);

        var reservaList = await Client().GetAsync("/api/Reserva");
        Assert.Equal(HttpStatusCode.Unauthorized, reservaList.StatusCode);

        var notificacion = await Client().PostAsync("/api/Notificacione", Json(new
        {
            reservaId = seed.ReservaId,
            tipo = "info",
            mensaje = "anon attempt",
            destinatarioEmail = "x@y.test",
        }));
        Assert.Equal(HttpStatusCode.Unauthorized, notificacion.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task AnonymousCatalogReads_Remain200()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();

        foreach (var path in new[]
        {
            "/api/Publicacione",
            $"/api/Publicacione/{seed.PublicacionId}",
            "/api/Categoria",
            "/api/Departamento",
            "/api/Municipio",
            $"/api/Reserva/disponibilidad/{seed.PublicacionId}",
        })
        {
            var res = await Client().GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        }
    }

    // ---- Requirement: Publication ownership gate --------------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task NonOwnerHost_EditDeleteAndCrossCreateForeignPublication_Returns403()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();
        var intruder = await RegisterUserAsync(); // authenticated, no host row at all
        var client = AuthedClient(intruder);

        var put = await client.PutAsync($"/api/Publicacione/{seed.PublicacionId}",
            PublicationBody(seed.AnfitrionId, seed.CategoriaId));
        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);

        var delete = await client.DeleteAsync($"/api/Publicacione/{seed.PublicacionId}");
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);

        // Creating under SOMEONE ELSE's host id must also be refused.
        var post = await client.PostAsync("/api/Publicacione",
            PublicationBody(seed.AnfitrionId, seed.CategoriaId));
        Assert.Equal(HttpStatusCode.Forbidden, post.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task Owner_EditDeleteAndCreateOwnPublication_Returns2xx()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var client = AuthedClient(owner);

        var post = await client.PostAsync("/api/Publicacione",
            PublicationBody(seed.AnfitrionId, seed.CategoriaId));
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);

        var put = await client.PutAsync($"/api/Publicacione/{seed.PublicacionId}",
            PublicationBody(seed.AnfitrionId, seed.CategoriaId, titulo: "Renamed by owner"));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var delete = await client.DeleteAsync($"/api/Publicacione/{seed.PublicacionId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task Admin_CanEditAnyPublication_Returns2xx()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();
        var client = AuthedClient(AdminSession());

        var put = await client.PutAsync($"/api/Publicacione/{seed.PublicacionId}",
            PublicationBody(seed.AnfitrionId, seed.CategoriaId, titulo: "Renamed by admin"));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var delete = await client.DeleteAsync($"/api/Publicacione/{seed.PublicacionId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task PublicacionesByHost_ListIsOwnerOrAdminOnly()
    {
        // The by-host list includes reservas (guest PII) -> not a catalog read.
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);

        var anon = await Client().GetAsync($"/api/Publicacione/anfitrion/{seed.AnfitrionId}");
        Assert.Equal(HttpStatusCode.Unauthorized, anon.StatusCode);

        var intruder = await RegisterUserAsync();
        var intruderRes = await AuthedClient(intruder).GetAsync($"/api/Publicacione/anfitrion/{seed.AnfitrionId}");
        Assert.Equal(HttpStatusCode.Forbidden, intruderRes.StatusCode);

        var ownerRes = await AuthedClient(owner).GetAsync($"/api/Publicacione/anfitrion/{seed.AnfitrionId}");
        Assert.Equal(HttpStatusCode.OK, ownerRes.StatusCode);

        var adminRes = await AuthedClient(AdminSession()).GetAsync($"/api/Publicacione/anfitrion/{seed.AnfitrionId}");
        Assert.Equal(HttpStatusCode.OK, adminRes.StatusCode);
    }

    // ---- Requirement: Host verification is admin-only ---------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task Verificacion_AdminOnly_NonAdmin403_Admin2xx_AnonymousCovered()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();

        // A plain authenticated usuario MUST NOT reach the route.
        var usuario = await RegisterUserAsync();
        var usuarioRes = await AuthedClient(usuario)
            .PutAsync($"/api/Anfitrione/{seed.AnfitrionId}/verificacion", Json(true));
        Assert.Equal(HttpStatusCode.Forbidden, usuarioRes.StatusCode);

        // Neither may the host's OWN anfitrion-role token self-verify.
        var anfitrionToken = MintToken(usuario.UserId.ToString(), "anfitrion");
        var self = AuthedClient(new Session(usuario.UserId, usuario.Email, anfitrionToken, NewCsrf()));
        var selfRes = await self.PutAsync($"/api/Anfitrione/{seed.AnfitrionId}/verificacion", Json(true));
        Assert.Equal(HttpStatusCode.Forbidden, selfRes.StatusCode);
        Assert.False(await ReadHostVerifiedAsync(seed.AnfitrionId));

        // Admin with a valid CSRF pair applies the change.
        var adminRes = await AuthedClient(AdminSession())
            .PutAsync($"/api/Anfitrione/{seed.AnfitrionId}/verificacion", Json(true));
        Assert.Equal(HttpStatusCode.NoContent, adminRes.StatusCode);
        Assert.True(await ReadHostVerifiedAsync(seed.AnfitrionId));
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task GenericHostEdit_CannotSelfVerifyOrReassignOwnership()
    {
        // The whole-entity PUT could historically flip Verificado/UsuarioId from
        // the body, bypassing the admin-only verificacion gate. It must now
        // preserve both for non-admin callers.
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var client = AuthedClient(owner);

        var res = await client.PutAsync($"/api/Anfitrione/{seed.AnfitrionId}", Json(new
        {
            id = seed.AnfitrionId,
            municipioId = seed.MunicipioId,
            nombre = "Renamed Host",
            email = "renamed@authz.test",
            verificado = true,
            usuarioId = 999999,
        }));

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        Assert.False(await ReadHostVerifiedAsync(seed.AnfitrionId));
        Assert.Equal(owner.UserId, await ReadHostOwnerAsync(seed.AnfitrionId));
    }

    // ---- Requirement: host profile (perfil) is owner-or-admin --------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task HostProfile_EditorIsOwnerOrAdmin()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);

        var intruder = await RegisterUserAsync();
        var intruderRes = await AuthedClient(intruder)
            .PutAsync($"/api/Anfitrione/{seed.AnfitrionId}/perfil", Json(new { descripcion = "hijacked" }));
        Assert.Equal(HttpStatusCode.Forbidden, intruderRes.StatusCode);

        var ownerRes = await AuthedClient(owner)
            .PutAsync($"/api/Anfitrione/{seed.AnfitrionId}/perfil", Json(new { descripcion = "my bio" }));
        Assert.Equal(HttpStatusCode.OK, ownerRes.StatusCode);
    }

    // ---- Requirement: Registrar binds identity from the token --------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task Registrar_BindsSubjectFromToken_AndPromotesCaller()
    {
        var user = await RegisterUserAsync();
        var (municipioId, _) = await SeedGeoAndCategoryAsync();

        var res = await AuthedClient(user).PostAsync("/api/Anfitrione/registrar", Json(new
        {
            municipioId,
            nombre = "Real Host",
            email = user.Email,
        }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var hostId = doc.RootElement.GetProperty("id").GetInt32();

        Assert.Equal(user.UserId, await ReadHostOwnerAsync(hostId));
        Assert.Equal("anfitrion", await ReadUserRolAsync(user.UserId));
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task Registrar_IgnoresBodyUsuarioId_VictimRoleUntouched()
    {
        var attacker = await RegisterUserAsync();
        var victim = await RegisterUserAsync();
        var (municipioId, _) = await SeedGeoAndCategoryAsync();

        var res = await AuthedClient(attacker).PostAsync("/api/Anfitrione/registrar", Json(new
        {
            usuarioId = victim.UserId, // mass-assignment attempt: must be ignored
            municipioId,
            nombre = "Sneaky Host",
            email = attacker.Email,
        }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var hostId = doc.RootElement.GetProperty("id").GetInt32();

        // The host row links to the TOKEN sub, never the body id, and only the
        // caller's role changes.
        Assert.Equal(attacker.UserId, await ReadHostOwnerAsync(hostId));
        Assert.Equal("anfitrion", await ReadUserRolAsync(attacker.UserId));
        Assert.Equal("usuario", await ReadUserRolAsync(victim.UserId));
    }

    // ---- Reservation owner-or-admin gates ----------------------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task ReservaCancel_OwnerAllowed_StrangerForbidden()
    {
        var owner = await RegisterUserAsync();
        var seed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var reservaId = await SeedReservaAsync(seed.PublicacionId, owner.UserId);

        var stranger = await RegisterUserAsync();
        var strangerRes = await AuthedClient(stranger).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, strangerRes.StatusCode);

        var ownerRes = await AuthedClient(owner).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.OK, ownerRes.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task ReservaOrphan_NullOwner_AdminOnly()
    {
        var seed = await SeedPublicationOwnedByRandomHostAsync();
        var reservaId = await SeedReservaAsync(seed.PublicacionId, usuarioId: null);

        var stranger = await RegisterUserAsync();
        var strangerRes = await AuthedClient(stranger).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, strangerRes.StatusCode);

        var adminRes = await AuthedClient(AdminSession()).PutAsync($"/api/Reserva/{reservaId}/cancelar", content: null);
        Assert.Equal(HttpStatusCode.OK, adminRes.StatusCode);
    }

    // ---- helpers -----------------------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

    private sealed record Seed(
        int MunicipioId,
        int CategoriaId,
        int AnfitrionId,
        int PublicacionId,
        int ReservaId);

    private HttpClient Client() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false, // drive cookies explicitly (same contract as the AuthN slice)
        });

    /// <summary>Authenticated client: valid auth cookie plus matching CSRF double-submit pair.</summary>
    private HttpClient AuthedClient(Session session)
    {
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={session.Auth}; {AuthConstants.CsrfCookieName}={session.Csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, session.Csrf);
        return client;
    }

    /// <summary>Register through the real endpoint and capture the issued session cookies.</summary>
    private async Task<Session> RegisterUserAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Authz",
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

    /// <summary>
    /// An admin session built by minting a token with rol=admin against the
    /// fixture's test key — identical technique to the AuthN forged-cookie
    /// helpers, with a self-paired CSRF value the middleware accepts.
    /// </summary>
    private Session AdminSession() =>
        new(UserId: 0, Email: "admin@authz.test", Auth: MintToken("0", "admin"), Csrf: NewCsrf());

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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@authz.test".ToLowerInvariant();

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

    /// <summary>Body valid against <c>CreatePublicacioneValidator</c> (precio/capacidad > 0, titulo >= 3).</summary>
    private static StringContent PublicationBody(int anfitrionId, int categoriaId, string titulo = "Authz Fixture Pub") =>
        Json(new
        {
            anfitrionId,
            categoriaId,
            titulo,
            descripcion = "Seeded by the AuthZ slice.",
            tipo = "hospedaje",
            precioPorNoche = 100,
            capacidadMaxima = 4,
            horarios = Array.Empty<object>(),
            experiencia = Array.Empty<object>(),
            publicacionAmenidads = Array.Empty<object>(),
        });

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    /// <summary>Create a departamento/municipio/categoria triple with unique names.</summary>
    private async Task<(int MunicipioId, int CategoriaId)> SeedGeoAndCategoryAsync()
    {
        var tag = Guid.NewGuid().ToString("N");
        await using var db = NewDb();

        var departamento = new Departamento { Nombre = $"Dep {tag}" };
        var municipio = new Municipio { Nombre = $"Mun {tag}", Departamento = departamento };
        var categoria = new Categoria { Nombre = $"Cat {tag}", Tipo = "hospedaje" };
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

    private async Task<int> SeedPublicacionAsync(int anfitrionId, int categoriaId)
    {
        await using var db = NewDb();
        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoriaId,
            Tipo = "hospedaje",
            Titulo = "Authz seed publication",
            Descripcion = "Seeded for ownership gates.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 2,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    private async Task<int> SeedReservaAsync(int publicacionId, int? usuarioId)
    {
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Guest Person",
            EmailHuesped = NewEmail(),
            FechaInicio = DateOnly.FromDateTime(DateTime.Today).AddDays(30),
            FechaFin = DateOnly.FromDateTime(DateTime.Today).AddDays(33),
            NumeroHuespedes = 1,
            PrecioTotal = 150m,
            Estado = "pendiente",
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    /// <summary>Full chain: fresh user -> host row -> publication -> pending reserva.</summary>
    private async Task<Seed> SeedPublicationOwnedByUserAsync(int usuarioId)
    {
        var (municipioId, categoriaId) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId, municipioId);
        var publicacionId = await SeedPublicacionAsync(anfitrionId, categoriaId);
        var reservaId = await SeedReservaAsync(publicacionId, usuarioId);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId, reservaId);
    }

    /// <summary>Chain owned by a DB-only host (no login): nobody's subject but admin/mystery can claim it.</summary>
    private async Task<Seed> SeedPublicationOwnedByRandomHostAsync()
    {
        var (municipioId, categoriaId) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId: null, municipioId);
        var publicacionId = await SeedPublicacionAsync(anfitrionId, categoriaId);
        var reservaId = await SeedReservaAsync(publicacionId, usuarioId: null);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId, reservaId);
    }

    private async Task<bool> ReadHostVerifiedAsync(int hostId)
    {
        await using var db = NewDb();
        return await db.Anfitriones.Where(a => a.Id == hostId).Select(a => a.Verificado).FirstAsync() == true;
    }

    private async Task<int?> ReadHostOwnerAsync(int hostId)
    {
        await using var db = NewDb();
        return await db.Anfitriones.Where(a => a.Id == hostId).Select(a => a.UsuarioId).FirstAsync();
    }

    private async Task<string> ReadUserRolAsync(int userId)
    {
        await using var db = NewDb();
        return await db.Usuarios.Where(u => u.Id == userId).Select(u => u.Rol).FirstAsync();
    }
}
