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
/// Vertical integration slice extending the owner-or-admin matrix to the
/// experiencia and publication-amenidad content routes plus the admin-only
/// reference-data catalog writes (categoria/municipio). Same pipeline and
/// ephemeral Testcontainers Postgres fixture as
/// <see cref="AuthzIntegrationTests"/> (shared AuthN collection fixture).
/// Traces: authz-roles-ownership spec requirements "Publication ownership
/// gate" (re-parenting must not escape it) and "Public read, protected write"
/// for the reference catalogs.
/// </summary>
[Collection("AuthN")]
public sealed class ExperienciaAndCatalogAuthzTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public ExperienciaAndCatalogAuthzTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: AuthZ integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Experiencia owner-or-admin gate ----------------------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task ExperienciaMutations_OwnershipGate_NonOwner403_OwnerAndAdmin2xx()
    {
        var owner = await RegisterUserAsync();
        var ownerSeed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var experienciaId = await SeedExperienciaAsync(ownerSeed.PublicacionId);

        var intruder = await RegisterUserAsync();
        var intruderSeed = await SeedPublicationOwnedByUserAsync(intruder.UserId);

        // PUT: a stranger may not edit someone else's experiencia.
        var strangerPut = await AuthedClient(intruder).PutAsync(
            $"/api/Experiencia/{experienciaId}", ExperienciaBody(ownerSeed.PublicacionId));
        Assert.Equal(HttpStatusCode.Forbidden, strangerPut.StatusCode);

        // POST: attaching an experience to a foreign publication must be refused.
        var strangerPost = await AuthedClient(intruder).PostAsync(
            "/api/Experiencia", ExperienciaBody(ownerSeed.PublicacionId));
        Assert.Equal(HttpStatusCode.Forbidden, strangerPost.StatusCode);
        Assert.False(await PublicacionHasExtraExperienciaAsync(ownerSeed.PublicacionId, experienciaId));

        // DELETE: same denial, row untouched.
        var strangerDelete = await AuthedClient(intruder).DeleteAsync($"/api/Experiencia/{experienciaId}");
        Assert.Equal(HttpStatusCode.Forbidden, strangerDelete.StatusCode);
        Assert.Equal(ownerSeed.PublicacionId, await ReadExperienciaPublicacionAsync(experienciaId));

        // The ownership gate also blocks re-parenting an OWN experience to a
        // foreign publication (current owned, target not).
        var crossReparent = await AuthedClient(owner).PutAsync(
            $"/api/Experiencia/{experienciaId}", ExperienciaBody(intruderSeed.PublicacionId));
        Assert.Equal(HttpStatusCode.Forbidden, crossReparent.StatusCode);
        Assert.Equal(ownerSeed.PublicacionId, await ReadExperienciaPublicacionAsync(experienciaId));

        // The owner may edit/create content on their own publication.
        Assert.Equal(HttpStatusCode.NoContent, (await AuthedClient(owner).PutAsync(
            $"/api/Experiencia/{experienciaId}",
            ExperienciaBody(ownerSeed.PublicacionId, nombre: "Renamed by owner"))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await AuthedClient(owner).PostAsync(
            "/api/Experiencia", ExperienciaBody(ownerSeed.PublicacionId))).StatusCode);
        Assert.True(await ExperienciaExistsAsync(experienciaId));

        // Admin overrides the gate everywhere.
        var admin = AuthedClient(AdminSession());
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsync(
            "/api/Experiencia", ExperienciaBody(intruderSeed.PublicacionId))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await admin.PutAsync($"/api/Experiencia/{experienciaId}",
                ExperienciaBody(ownerSeed.PublicacionId))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await admin.DeleteAsync($"/api/Experiencia/{experienciaId}")).StatusCode);
        Assert.False(await ExperienciaExistsAsync(experienciaId));
    }

    // ---- Reference-data catalogs are admin-only ---------------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task CatalogWrites_AdminOnly_NonAdmin403_Admin2xx()
    {
        var (municipioId, categoriaId, departamentoId) = await SeedGeoAndCategoryAsync();
        var usuario = await RegisterUserAsync();

        var attempts = new List<(string Method, string Url, HttpContent? Body)>
        {
            ("PUT", $"/api/Categoria/{categoriaId}", CategoriaBody(categoriaId)),
            ("POST", "/api/Categoria", CategoriaBody()),
            ("DELETE", $"/api/Categoria/{categoriaId}", null),
            ("PUT", $"/api/Municipio/{municipioId}", MunicipioBody(departamentoId)),
            ("POST", "/api/Municipio", MunicipioBody(departamentoId)),
            ("DELETE", $"/api/Municipio/{municipioId}", null),
        };

        foreach (var (method, url, body) in attempts)
        {
            var client = AuthedClient(usuario);
            var res = method switch
            {
                "PUT" => await client.PutAsync(url, body),
                "POST" => await client.PostAsync(url, body),
                _ => await client.DeleteAsync(url),
            };
            Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        }

        // Nothing the anonymous catalog GETs rely on was destroyed.
        Assert.Equal(HttpStatusCode.OK, (await Client().GetAsync($"/api/Categoria/{categoriaId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().GetAsync($"/api/Municipio/{municipioId}")).StatusCode);

        // Admin applies the same writes the usuario was denied.
        var admin = AuthedClient(AdminSession());
        var catCreated = await admin.PostAsync("/api/Categoria", CategoriaBody());
        Assert.Equal(HttpStatusCode.Created, catCreated.StatusCode);
        using (var catDoc = JsonDocument.Parse(await catCreated.Content.ReadAsStringAsync()))
        {
            var newCatId = catDoc.RootElement.GetProperty("id").GetInt32();
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsync(
                $"/api/Categoria/{newCatId}", CategoriaBody(newCatId))).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent,
                (await admin.DeleteAsync($"/api/Categoria/{newCatId}")).StatusCode);
            Assert.False(await CategoriaExistsAsync(newCatId));
        }

        var munCreated = await admin.PostAsync("/api/Municipio", MunicipioBody(departamentoId));
        Assert.Equal(HttpStatusCode.Created, munCreated.StatusCode);
        using (var munDoc = JsonDocument.Parse(await munCreated.Content.ReadAsStringAsync()))
        {
            var newMunId = munDoc.RootElement.GetProperty("id").GetInt32();
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsync(
                $"/api/Municipio/{newMunId}", MunicipioBody(departamentoId))).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent,
                (await admin.DeleteAsync($"/api/Municipio/{newMunId}")).StatusCode);
            Assert.False(await MunicipioExistsAsync(newMunId));
        }

        // The seeded catalog rows were never touched by any denied attempt.
        Assert.True(await CategoriaExistsAsync(categoriaId));
        Assert.True(await MunicipioExistsAsync(municipioId));
    }

    // ---- PublicacionAmenidad owner-or-admin gate ---------------------------------

    [SkippableFact]
    [Trait("Category", "AuthZ")]
    public async Task PublicacionAmenidadMutations_OwnershipGate()
    {
        var owner = await RegisterUserAsync();
        var ownerSeed = await SeedPublicationOwnedByUserAsync(owner.UserId);
        var intruder = await RegisterUserAsync();
        var foreignSeed = await SeedPublicationOwnedByRandomHostAsync();

        var amenidadUno = await SeedAmenidadAsync();
        var amenidadDos = await SeedAmenidadAsync();
        var amenidadTres = await SeedAmenidadAsync();

        // The owner attaches/detaches amenities on their own publication.
        var ownerPost = await AuthedClient(owner).PostAsync("/api/PublicacionAmenidad",
            Json(new { publicacionId = ownerSeed.PublicacionId, amenidadId = amenidadUno }));
        Assert.Equal(HttpStatusCode.Created, ownerPost.StatusCode);

        var ownerDelete = await AuthedClient(owner).DeleteAsync(
            $"/api/PublicacionAmenidad/{ownerSeed.PublicacionId}/{amenidadUno}");
        Assert.Equal(HttpStatusCode.NoContent, ownerDelete.StatusCode);
        Assert.False(await PublicacionAmenidadExistsAsync(ownerSeed.PublicacionId, amenidadUno));

        // A non-owner is denied on both writes for a foreign publication and
        // the rows must never appear.
        var intruderPost = await AuthedClient(intruder).PostAsync("/api/PublicacionAmenidad",
            Json(new { publicacionId = ownerSeed.PublicacionId, amenidadId = amenidadDos }));
        Assert.Equal(HttpStatusCode.Forbidden, intruderPost.StatusCode);
        Assert.False(await PublicacionAmenidadExistsAsync(ownerSeed.PublicacionId, amenidadDos));

        var intruderDelete = await AuthedClient(intruder).DeleteAsync(
            $"/api/PublicacionAmenidad/{ownerSeed.PublicacionId}/{amenidadUno}");
        Assert.Equal(HttpStatusCode.Forbidden, intruderDelete.StatusCode);

        // Admin override: write on a publication owned by a DB-only host.
        var admin = AuthedClient(AdminSession());
        var adminPost = await admin.PostAsync("/api/PublicacionAmenidad",
            Json(new { publicacionId = foreignSeed.PublicacionId, amenidadId = amenidadTres }));
        Assert.Equal(HttpStatusCode.Created, adminPost.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync(
            $"/api/PublicacionAmenidad/{foreignSeed.PublicacionId}/{amenidadTres}")).StatusCode);
        Assert.False(await PublicacionAmenidadExistsAsync(foreignSeed.PublicacionId, amenidadTres));
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
    /// fixture's test key — identical technique to the Authn forged-cookie
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

    private static StringContent ExperienciaBody(int publicacionId, string nombre = "Experiencia Authz") =>
        Json(new
        {
            publicacionId,
            nombre,
            descripcion = "Seeded by the AuthZ slice.",
            duracionHoras = 2,
            precioAdicional = 5m,
        });

    private static StringContent CategoriaBody(int? id = null) =>
        Json(id.HasValue
            ? new { id, nombre = "Cat Update", tipo = "hospedaje" }
            : new { nombre = $"Cat {Guid.NewGuid():N}", tipo = "hospedaje" });

    private static StringContent MunicipioBody(int departamentoId) =>
        Json(new { departamentoId, nombre = "Municipio Authz" });

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    /// <summary>Create a departamento/municipio/categoria triple with unique names.</summary>
    private async Task<(int MunicipioId, int CategoriaId, int DepartamentoId)> SeedGeoAndCategoryAsync()
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
        return (municipio.Id, categoria.Id, departamento.Id);
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
            FechaInicio = DateOnly.FromDateTime(DateTime.Today).AddDays(60),
            FechaFin = DateOnly.FromDateTime(DateTime.Today).AddDays(63),
            NumeroHuespedes = 1,
            PrecioTotal = 150m,
            Estado = "pendiente",
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task<int> SeedExperienciaAsync(int publicacionId)
    {
        await using var db = NewDb();
        var experiencia = new Experiencia
        {
            PublicacionId = publicacionId,
            Nombre = $"Exp {Guid.NewGuid():N}",
            CreatedAt = DateTime.Now,
        };
        db.Experiencias.Add(experiencia);
        await db.SaveChangesAsync();
        return experiencia.Id;
    }

    private async Task<int> SeedAmenidadAsync()
    {
        await using var db = NewDb();
        var amenidad = new Amenidade
        {
            Nombre = $"Wifi {Guid.NewGuid():N}",
            CreatedAt = DateTime.Now,
        };
        db.Amenidades.Add(amenidad);
        await db.SaveChangesAsync();
        return amenidad.Id;
    }

    /// <summary>Full chain: fresh user -> host row -> publication -> pending reserva.</summary>
    private async Task<Seed> SeedPublicationOwnedByUserAsync(int usuarioId)
    {
        var (municipioId, categoriaId, _) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId, municipioId);
        var publicacionId = await SeedPublicacionAsync(anfitrionId, categoriaId);
        var reservaId = await SeedReservaAsync(publicacionId, usuarioId);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId, reservaId);
    }

    /// <summary>Chain owned by a DB-only host (no login): nobody's subject but admin can claim it.</summary>
    private async Task<Seed> SeedPublicationOwnedByRandomHostAsync()
    {
        var (municipioId, categoriaId, _) = await SeedGeoAndCategoryAsync();
        var anfitrionId = await SeedHostAsync(usuarioId: null, municipioId);
        var publicacionId = await SeedPublicacionAsync(anfitrionId, categoriaId);
        var reservaId = await SeedReservaAsync(publicacionId, usuarioId: null);
        return new Seed(municipioId, categoriaId, anfitrionId, publicacionId, reservaId);
    }

    private async Task<int> ReadExperienciaPublicacionAsync(int experienciaId)
    {
        await using var db = NewDb();
        return await db.Experiencias.AsNoTracking()
            .Where(e => e.Id == experienciaId)
            .Select(e => e.PublicacionId)
            .SingleAsync();
    }

    private async Task<bool> ExperienciaExistsAsync(int experienciaId)
    {
        await using var db = NewDb();
        return await db.Experiencias.AsNoTracking().AnyAsync(e => e.Id == experienciaId);
    }

    private async Task<bool> PublicacionHasExtraExperienciaAsync(int publicacionId, int excludeId)
    {
        await using var db = NewDb();
        return await db.Experiencias.AsNoTracking()
            .AnyAsync(e => e.PublicacionId == publicacionId && e.Id != excludeId);
    }

    private async Task<bool> CategoriaExistsAsync(int categoriaId)
    {
        await using var db = NewDb();
        return await db.Categorias.AsNoTracking().AnyAsync(c => c.Id == categoriaId);
    }

    private async Task<bool> MunicipioExistsAsync(int municipioId)
    {
        await using var db = NewDb();
        return await db.Municipios.AsNoTracking().AnyAsync(m => m.Id == municipioId);
    }

    private async Task<bool> PublicacionAmenidadExistsAsync(int publicacionId, int amenidadId)
    {
        await using var db = NewDb();
        return await db.PublicacionAmenidads.AsNoTracking()
            .AnyAsync(pa => pa.PublicacionId == publicacionId && pa.AmenidadId == amenidadId);
    }
}
