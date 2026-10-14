using System.Net;
using System.Text.Json;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace IguanaSV.Api.Tests.Translation;

[Collection("AuthN")]
public sealed class PublicContentLocaleIntegrationTests
{
    private readonly AuthApiFixture _fixture;

    public PublicContentLocaleIntegrationTests(AuthApiFixture fixture) => _fixture = fixture;

    [SkippableFact]
    public async Task PublicReads_LocalizeRootTextWithSpanishFallbackAndHideTranslationStorage()
    {
        Skip.IfNot(_fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: publication locale integration test requires an ephemeral Postgres.");

        var publicationId = await CreatePublicationWithEnglishTextAsync();
        using var client = _fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

        using var spanishResponse = await client.GetAsync($"/api/Publicacione/{publicationId}");
        Assert.Equal(HttpStatusCode.OK, spanishResponse.StatusCode);
        using var spanish = JsonDocument.Parse(await spanishResponse.Content.ReadAsStringAsync());
        Assert.Equal("Título fuente de prueba", spanish.RootElement.GetProperty("titulo").GetString());
        Assert.Equal("Descripción fuente de prueba", spanish.RootElement.GetProperty("descripcion").GetString());
        Assert.False(spanish.RootElement.TryGetProperty("tituloEn", out _));
        Assert.False(spanish.RootElement.TryGetProperty("descripcionEn", out _));

        using var englishResponse = await client.GetAsync($"/api/Publicacione/{publicationId}?contentLocale=en");
        Assert.Equal(HttpStatusCode.OK, englishResponse.StatusCode);
        using var english = JsonDocument.Parse(await englishResponse.Content.ReadAsStringAsync());
        Assert.Equal("Synthetic English title", english.RootElement.GetProperty("titulo").GetString());
        Assert.Equal("Descripción fuente de prueba", english.RootElement.GetProperty("descripcion").GetString());
        var englishHostId = english.RootElement.GetProperty("anfitrion").GetProperty("id").GetInt32();
        var englishExperience = english.RootElement.GetProperty("experiencia")[0];
        Assert.Equal("Coffee farm walk", englishExperience.GetProperty("nombre").GetString());
        Assert.Equal("Visit local coffee farms", englishExperience.GetProperty("descripcion").GetString());
        Assert.False(englishExperience.TryGetProperty("nombreEn", out _));
        Assert.False(englishExperience.TryGetProperty("descripcionEn", out _));

        using var hostResponse = await client.GetAsync($"/api/Anfitrione/{englishHostId}?contentLocale=en");
        Assert.Equal(HttpStatusCode.OK, hostResponse.StatusCode);
        using var englishHost = JsonDocument.Parse(await hostResponse.Content.ReadAsStringAsync());
        Assert.Equal("A local guide", englishHost.RootElement.GetProperty("descripcion").GetString());
        Assert.False(englishHost.RootElement.TryGetProperty("descripcionEn", out _));

        using var invalidResponse = await client.GetAsync($"/api/Publicacione/{publicationId}?contentLocale=fr");
        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);
        using var invalidLocale = JsonDocument.Parse(await invalidResponse.Content.ReadAsStringAsync());
        Assert.Equal("contentLocale debe ser 'es' o 'en'.",
            invalidLocale.RootElement.GetProperty("mensaje").GetString());
    }

    private async Task<int> CreatePublicationWithEnglishTextAsync()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString)
            .Options;

        await using var db = new IguanasDbContext(options);
        var suffix = Guid.NewGuid().ToString("N");
        var departamento = new Departamento { Nombre = $"Locale test {suffix}" };
        var municipio = new Municipio { Nombre = $"Locale town {suffix}", Departamento = departamento };
        var anfitrion = new Anfitrione
        {
            Nombre = "Locale test host",
            Email = $"locale-{suffix}@test.local",
            Descripcion = "Guía local",
            DescripcionEn = "A local guide",
            Municipio = municipio,
        };
        var categoria = new Categoria { Nombre = $"Locale category {suffix}", Tipo = "hospedaje" };
        var publicacion = new Publicacione
        {
            Anfitrion = anfitrion,
            Categoria = categoria,
            Tipo = "hospedaje",
            Titulo = "Título fuente de prueba",
            Descripcion = "Descripción fuente de prueba",
            TituloEn = "Synthetic English title",
            DescripcionEn = null,
            Experiencia =
            [
                new Experiencia
                {
                    Nombre = "Caminata por finca de café",
                    NombreEn = "Coffee farm walk",
                    Descripcion = "Visitamos fincas de café locales.",
                    DescripcionEn = "Visit local coffee farms",
                },
            ],
            PrecioPorNoche = 10m,
            CapacidadMaxima = 2,
        };

        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }
}
