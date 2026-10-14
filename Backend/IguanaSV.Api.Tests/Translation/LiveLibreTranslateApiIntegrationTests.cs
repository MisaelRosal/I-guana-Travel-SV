using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace IguanaSV.Api.Tests.Translation;

[Collection("AuthN")]
public sealed class LiveLibreTranslateApiIntegrationTests
{
    private readonly AuthApiFixture _fixture;

    public LiveLibreTranslateApiIntegrationTests(AuthApiFixture fixture) => _fixture = fixture;

    [SkippableFact]
    public async Task LiveLibreTranslate_ApiCreatePersistsTranslation_AndEnglishPublicReadReturnsIt()
    {
        Skip.IfNot(_fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: live API test requires the ephemeral AuthN PostgreSQL fixture.");

        var translatorUrl = Environment.GetEnvironmentVariable("LIBRETRANSLATE_TEST_URL");
        Skip.If(string.IsNullOrWhiteSpace(translatorUrl),
            "Set LIBRETRANSLATE_TEST_URL to run the live API/controller/persistence test.");

        using var translator = new HttpClient { BaseAddress = EnsureTrailingSlash(new Uri(translatorUrl!)) };
        using var health = await translator.GetAsync("health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        using var healthBody = JsonDocument.Parse(await health.Content.ReadAsStringAsync());
        Assert.Equal("ok", healthBody.RootElement.GetProperty("status").GetString());

        var (hostId, categoryId) = await CreateReferencesAsync();
        var overrides = new Dictionary<string, string?>
        {
            ["Translation:LibreTranslate:Enabled"] = "true",
            ["Translation:LibreTranslate:BaseUrl"] = translatorUrl,
        };

        using var factory = new AuthApiFactory(overrides);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

        var csrf = "live-libretranslate-csrf-token";
        var token = MintAdminToken();
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "Cookie",
            $"{AuthConstants.AuthCookieName}={token}; {AuthConstants.CsrfCookieName}={csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, csrf);

        const string sourceTitle = "Una casa cerca de la playa";
        const string sourceDescription = "Descripción sintética para verificar la integración completa.";
        var dto = new CreatePublicacioneDto
        {
            AnfitrionId = hostId,
            CategoriaId = categoryId,
            Tipo = "hospedaje",
            Titulo = sourceTitle,
            Descripcion = sourceDescription,
            PrecioPorNoche = 24m,
            CapacidadMaxima = 2,
        };

        using var createResponse = await client.PostAsJsonAsync("/api/Publicacione", dto);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var created = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var publicationId = created.RootElement.GetProperty("id").GetInt32();

        await using (var db = CreateDbContext())
        {
            var publication = await db.Publicaciones.AsNoTracking()
                .SingleAsync(item => item.Id == publicationId);
            Assert.Equal(sourceTitle, publication.Titulo);
            Assert.Equal(sourceDescription, publication.Descripcion);
            Assert.False(string.IsNullOrWhiteSpace(publication.TituloEn));
            Assert.False(string.IsNullOrWhiteSpace(publication.DescripcionEn));
        }

        using var readResponse = await client.GetAsync($"/api/Publicacione/{publicationId}?contentLocale=en");
        Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
        using var englishRead = JsonDocument.Parse(await readResponse.Content.ReadAsStringAsync());
        Assert.False(string.IsNullOrWhiteSpace(englishRead.RootElement.GetProperty("titulo").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(englishRead.RootElement.GetProperty("descripcion").GetString()));
        Assert.False(englishRead.RootElement.TryGetProperty("tituloEn", out _));
        Assert.False(englishRead.RootElement.TryGetProperty("descripcionEn", out _));
    }

    private async Task<(int HostId, int CategoryId)> CreateReferencesAsync()
    {
        await using var db = CreateDbContext();
        var suffix = Guid.NewGuid().ToString("N");
        var department = new Departamento { Nombre = $"Live translation {suffix}" };
        var municipality = new Municipio { Nombre = $"Synthetic town {suffix}", Departamento = department };
        var host = new Anfitrione
        {
            Nombre = "Live translation host",
            Email = $"live-translation-{suffix}@test.local",
            Municipio = municipality,
        };
        var category = new Categoria { Nombre = $"Live {suffix}", Tipo = "hospedaje" };
        db.Anfitriones.Add(host);
        db.Categorias.Add(category);
        await db.SaveChangesAsync();
        return (host.Id, category.Id);
    }

    private IguanasDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private static string MintAdminToken()
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AuthApiFactory.TestJwtKey)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: AuthApiFactory.TestIssuer,
            audience: AuthApiFactory.TestAudience,
            claims:
            [
                new Claim(AuthConstants.SubClaim, "99999999"),
                new Claim(AuthConstants.RolClaim, AuthConstants.AdminRole),
            ],
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static Uri EnsureTrailingSlash(Uri uri) =>
        new(uri.AbsoluteUri.TrimEnd('/') + "/");
}
