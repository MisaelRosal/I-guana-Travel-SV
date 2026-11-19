using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace IguanaSV.Api.Tests.Asistente;

/// <summary>
/// Contract tests for POST /api/Asistente/chat. The model backend is replaced by
/// a deterministic fake, so these assert the HTTP surface (validation, stream
/// shape, publication resolution, history whitelisting) without Ollama.
/// </summary>
[Collection("AuthN")]
public sealed class AsistenteIntegrationTests
{
    private readonly AuthApiFixture _fixture;

    public AsistenteIntegrationTests(AuthApiFixture fixture) => _fixture = fixture;

    [SkippableFact]
    public async Task Chat_StreamsDeltasAndResolvesMentionedPublications()
    {
        Skip.IfNot(_fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: assistant integration test needs the shared API host.");

        var servicio = new ServicioFalso();
        using var cliente = ClienteCon(servicio);

        using var respuesta = await cliente.PostAsJsonAsync("/api/Asistente/chat", new
        {
            mensaje = "¿Que hay en Suchitoto?",
            contentLocale = "es",
            historial = new object[]
            {
                new { rol = "usuario", texto = "Hola" },
                new { rol = "asistente", texto = "¡Hola! ¿En que te ayudo?" },
            },
        });

        Assert.Equal(HttpStatusCode.OK, respuesta.StatusCode);
        Assert.Equal("application/x-ndjson", respuesta.Content.Headers.ContentType?.MediaType);

        var lineas = LeerLineas(await respuesta.Content.ReadAsStringAsync());
        var texto = string.Concat(lineas
            .Where(l => l.TryGetProperty("delta", out _))
            .Select(l => l.GetProperty("delta").GetString()));

        Assert.Equal("Mirá \"Cabaña Lago\" en Suchitoto.", texto);

        var final = lineas[^1];
        Assert.True(final.GetProperty("done").GetBoolean());
        var publicaciones = final.GetProperty("publicaciones");
        Assert.Equal(1, publicaciones.GetArrayLength());
        Assert.Equal(7, publicaciones[0].GetProperty("id").GetInt32());
        Assert.Equal("Cabaña Lago", publicaciones[0].GetProperty("titulo").GetString());

        // The client-echoed history reached the model, in order and bounded.
        Assert.Equal(2, servicio.HistorialRecibido.Count);
        Assert.Equal("usuario", servicio.HistorialRecibido[0].Rol);
        Assert.Equal("asistente", servicio.HistorialRecibido[1].Rol);
    }

    [SkippableFact]
    public async Task Chat_RejectsEmptyMessageLongMessageAndUnknownLocale()
    {
        Skip.IfNot(_fixture.DockerAvailable, "Docker/Testcontainers unavailable.");

        using var cliente = ClienteCon(new ServicioFalso());

        var vacio = await cliente.PostAsJsonAsync("/api/Asistente/chat", new { mensaje = "   ", contentLocale = "es" });
        Assert.Equal(HttpStatusCode.BadRequest, vacio.StatusCode);

        var largo = await cliente.PostAsJsonAsync("/api/Asistente/chat", new { mensaje = new string('x', 501), contentLocale = "es" });
        Assert.Equal(HttpStatusCode.BadRequest, largo.StatusCode);

        var locale = await cliente.PostAsJsonAsync("/api/Asistente/chat", new { mensaje = "hola", contentLocale = "fr" });
        Assert.Equal(HttpStatusCode.BadRequest, locale.StatusCode);
        using var cuerpo = JsonDocument.Parse(await locale.Content.ReadAsStringAsync());
        Assert.Equal("contentLocale debe ser 'es' o 'en'.", cuerpo.RootElement.GetProperty("mensaje").GetString());
    }

    [SkippableFact]
    public async Task Chat_WhenDisabled_Returns503()
    {
        Skip.IfNot(_fixture.DockerAvailable, "Docker/Testcontainers unavailable.");

        using var cliente = ClienteCon(new ServicioFalso { Habilitado = false });

        using var respuesta = await cliente.PostAsJsonAsync("/api/Asistente/chat", new { mensaje = "hola", contentLocale = "es" });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, respuesta.StatusCode);
    }

    [SkippableFact]
    public async Task Chat_NormalizesHistoryRolesAndCapsTurnCount()
    {
        Skip.IfNot(_fixture.DockerAvailable, "Docker/Testcontainers unavailable.");

        var servicio = new ServicioFalso();
        using var cliente = ClienteCon(servicio);

        var historial = Enumerable.Range(0, 12)
            .Select(i => new { rol = i % 2 == 0 ? "system" : "asistente", texto = $"turno {i}" })
            .ToArray();

        using var respuesta = await cliente.PostAsJsonAsync("/api/Asistente/chat", new
        {
            mensaje = "seguimos",
            contentLocale = "es",
            historial,
        });

        Assert.Equal(HttpStatusCode.OK, respuesta.StatusCode);
        // Bounded to the last 8 turns, and only the asistente role survives as such.
        Assert.Equal(8, servicio.HistorialRecibido.Count);
        Assert.Equal("turno 4", servicio.HistorialRecibido[0].Texto);
        Assert.All(servicio.HistorialRecibido, t => Assert.Contains(t.Rol, new[] { "usuario", "asistente" }));
        Assert.Equal(4, servicio.HistorialRecibido.Count(t => t.Rol == "asistente"));
    }

    private HttpClient ClienteCon(IAsistenteService servicio)
    {
        var fabrica = _fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAsistenteService>();
                services.AddSingleton(servicio);
            }));

        return fabrica.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });
    }

    private static JsonElement[] LeerLineas(string cuerpo) =>
        cuerpo
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(linea => JsonDocument.Parse(linea).RootElement.Clone())
            .ToArray();

    private sealed class ServicioFalso : IAsistenteService
    {
        private static readonly CatalogoAsistenteItem[] Catalogo =
        [
            new(7, "hospedaje", "Cabaña Lago", "Vista al lago", "Cabaña", "Suchitoto", "Cuscatlán", 45.5m, 4),
        ];

        public bool Habilitado { get; init; } = true;

        public IReadOnlyList<AsistenteTurno> HistorialRecibido { get; private set; } = Array.Empty<AsistenteTurno>();

        public Task<IReadOnlyList<CatalogoAsistenteItem>> CatalogoAsync(string locale, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CatalogoAsistenteItem>>(Catalogo);

        public async IAsyncEnumerable<string> TransmitirAsync(
            IReadOnlyList<CatalogoAsistenteItem> catalogo,
            IReadOnlyList<AsistenteTurno> historial,
            string mensaje,
            string locale,
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            HistorialRecibido = historial;

            foreach (var delta in new[] { "Mirá ", "\"Cabaña Lago\"", " en Suchitoto." })
            {
                cancellationToken.ThrowIfCancellationRequested();
                await Task.Yield();
                yield return delta;
            }
        }
    }
}
