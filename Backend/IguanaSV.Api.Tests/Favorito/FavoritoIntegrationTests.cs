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

namespace IguanaSV.Api.Tests.Favorito;

/// <summary>
/// Vertical integration slice for the saved-publications (favoritas) feature.
/// Drives the real pipeline (cookie JWT + CSRF gate + [Authorize]) over HTTP
/// against the shared "AuthN" Testcontainers Postgres and proves, end-to-end:
///   * every route demands a session (anonymous -> 401);
///   * save/unsave are idempotent (double save keeps one row, double unsave is 204)
///     and strictly scoped to the caller's <c>sub</c> (a second user sees an empty
///     list even while the first user's row exists);
///   * saving an unknown publication answers 404;
///   * <c>/mios</c> applies the shared <c>contentLocale</c> contract (EN swaps in
///     the stored <c>titulo_en</c>, an unknown locale is 400);
///   * the CSRF double-submit gate guards the mutations like every other write.
/// Traces: fase-2 "publicaciones guardadas" (perfil de usuario normal).
/// </summary>
[Collection("AuthN")]
public sealed class FavoritoIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public FavoritoIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: Favorito integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    [SkippableFact]
    [Trait("Category", "Favorito")]
    public async Task AnonymousFavoriteRoutes_Return401()
    {
        var publicacionId = await SeedPublicationAsync();

        foreach (var call in new Func<HttpClient, Task<HttpResponseMessage>>[]
        {
            c => c.GetAsync("/api/Favorito/ids"),
            c => c.GetAsync("/api/Favorito/mios"),
            c => c.PostAsync($"/api/Favorito/{publicacionId}", content: null),
            c => c.DeleteAsync($"/api/Favorito/{publicacionId}"),
        })
        {
            var res = await call(Client());
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        }
    }

    [SkippableFact]
    [Trait("Category", "Favorito")]
    public async Task SaveAndUnsave_AreIdempotent_AndScopedToTheCaller()
    {
        var publicacionId = await SeedPublicationAsync();
        var owner = await RegisterUserAsync();
        var other = await RegisterUserAsync();
        var ownerClient = AuthedClient(owner);

        // Fresh user starts with an empty saved set on both routes.
        Assert.Equal(HttpStatusCode.OK, (await ownerClient.GetAsync("/api/Favorito/ids")).StatusCode);
        Assert.Empty(await ReadIdsAsync(ownerClient));
        Assert.Empty(await ReadMiosAsync(ownerClient));

        // Save, then save again: same 200, same end state (composite key arbiter).
        var first = await ownerClient.PostAsync($"/api/Favorito/{publicacionId}", content: null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.True(await ReadGuardadoAsync(first));

        var repeat = await ownerClient.PostAsync($"/api/Favorito/{publicacionId}", content: null);
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.True(await ReadGuardadoAsync(repeat));

        Assert.Equal(new[] { publicacionId }, await ReadIdsAsync(ownerClient));

        var mios = await ReadMiosAsync(ownerClient);
        var saved = Assert.Single(mios);
        Assert.Equal(publicacionId, saved.GetProperty("id").GetInt32());
        Assert.Equal("Favorito seed publication", saved.GetProperty("titulo").GetString());

        // The row count is the real idempotency proof: one row after two POSTs.
        await using (var db = NewDb())
        {
            var filas = await db.PublicacionesFavoritas
                .CountAsync(f => f.UsuarioId == owner.UserId);
            Assert.Equal(1, filas);
        }

        // A different authenticated user sees nothing of the above (sub scoping).
        var otherClient = AuthedClient(other);
        Assert.Empty(await ReadIdsAsync(otherClient));
        Assert.Empty(await ReadMiosAsync(otherClient));

        // Their "delete" touches only their (non-existent) row: 204, owner intact.
        var foreignDelete = await otherClient.DeleteAsync($"/api/Favorito/{publicacionId}");
        Assert.Equal(HttpStatusCode.NoContent, foreignDelete.StatusCode);
        Assert.Equal(new[] { publicacionId }, await ReadIdsAsync(ownerClient));

        // Unsave, then unsave again: idempotent 204 both times.
        var remove = await ownerClient.DeleteAsync($"/api/Favorito/{publicacionId}");
        Assert.Equal(HttpStatusCode.NoContent, remove.StatusCode);
        var removeAgain = await ownerClient.DeleteAsync($"/api/Favorito/{publicacionId}");
        Assert.Equal(HttpStatusCode.NoContent, removeAgain.StatusCode);

        Assert.Empty(await ReadIdsAsync(ownerClient));
        Assert.Empty(await ReadMiosAsync(ownerClient));
    }

    [SkippableFact]
    [Trait("Category", "Favorito")]
    public async Task SaveUnknownPublication_Returns404_AndKeepsListEmpty()
    {
        var user = await RegisterUserAsync();
        var client = AuthedClient(user);

        var res = await client.PostAsync("/api/Favorito/999999", content: null);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Empty(await ReadIdsAsync(client));
    }

    [SkippableFact]
    [Trait("Category", "Favorito")]
    public async Task Mios_HonorsContentLocale_AndRejectsUnknownLocale()
    {
        var publicacionId = await SeedPublicationAsync(tituloEn: "Favorito seed publication EN");
        var user = await RegisterUserAsync();
        var client = AuthedClient(user);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsync($"/api/Favorito/{publicacionId}", content: null)).StatusCode);

        var espanol = Assert.Single(await ReadMiosAsync(client, contentLocale: "es"));
        Assert.Equal("Favorito seed publication", espanol.GetProperty("titulo").GetString());

        var ingles = Assert.Single(await ReadMiosAsync(client, contentLocale: "en"));
        Assert.Equal("Favorito seed publication EN", ingles.GetProperty("titulo").GetString());

        var invalido = await client.GetAsync("/api/Favorito/mios?contentLocale=fr");
        Assert.Equal(HttpStatusCode.BadRequest, invalido.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Favorito")]
    public async Task SaveMutation_WithoutCsrfHeader_Returns400()
    {
        var publicacionId = await SeedPublicationAsync();
        var user = await RegisterUserAsync();

        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={user.Auth}");

        var res = await client.PostAsync($"/api/Favorito/{publicacionId}", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Empty(await ReadIdsAsync(client));
    }

    // ---- fixtures & helpers ---------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

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
            nombre = "Favorito",
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

    private static string NewEmail() => $"f{Guid.NewGuid():N}@favorito.test".ToLowerInvariant();

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

    /// <summary>Publication with its required geo/categoria/host chain, no owner login.</summary>
    private async Task<int> SeedPublicationAsync(string? tituloEn = null)
    {
        var tag = Guid.NewGuid().ToString("N");
        int municipioId;
        int categoriaId;
        await using (var db = NewDb())
        {
            var departamento = new Departamento { Nombre = $"Dep {tag}" };
            var municipio = new Municipio { Nombre = $"Mun {tag}", Departamento = departamento };
            var categoria = new Categoria { Nombre = $"Cat {tag}", Tipo = "hospedaje" };
            db.Departamentos.Add(departamento);
            db.Municipios.Add(municipio);
            db.Categorias.Add(categoria);
            await db.SaveChangesAsync();
            municipioId = municipio.Id;
            categoriaId = categoria.Id;
        }

        await using (var db = NewDb())
        {
            var host = new Anfitrione
            {
                MunicipioId = municipioId,
                Nombre = $"Host {tag}",
                Email = NewEmail(),
                Verificado = false,
            };
            var publicacion = new Publicacione
            {
                Anfitrion = host,
                CategoriaId = categoriaId,
                Tipo = "hospedaje",
                Titulo = "Favorito seed publication",
                TituloEn = tituloEn,
                Descripcion = "Seeded by the Favorito slice.",
                PrecioPorNoche = 50m,
                CapacidadMaxima = 2,
                Estado = "activo",
            };
            db.Anfitriones.Add(host);
            db.Publicaciones.Add(publicacion);
            await db.SaveChangesAsync();
            return publicacion.Id;
        }
    }

    private static async Task<bool> ReadGuardadoAsync(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("guardado").GetBoolean();
    }

    private async Task<int[]> ReadIdsAsync(HttpClient client, string? contentLocale = null)
    {
        var path = contentLocale is null ? "/api/Favorito/ids" : $"/api/Favorito/ids?contentLocale={contentLocale}";
        var res = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.EnumerateArray().Select(e => e.GetInt32()).ToArray();
    }

    private async Task<List<JsonElement>> ReadMiosAsync(HttpClient client, string? contentLocale = null)
    {
        var path = contentLocale is null ? "/api/Favorito/mios" : $"/api/Favorito/mios?contentLocale={contentLocale}";
        var res = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.EnumerateArray().Select(e => e.Clone()).ToList();
    }
}
