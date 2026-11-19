using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Services;

/// <summary>
/// Local Ollama backend. The catalog is injected into the system prompt instead
/// of living in a vector store: the whole active catalog is a handful of rows,
/// so embedding and retrieval would add moving parts for no gain.
/// </summary>
public sealed class OllamaAsistenteService : IAsistenteService
{
    public const string HttpClientName = "ollama";

    private static readonly JsonSerializerOptions ChunkJson = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IOptions<AsistenteOptions> _options;
    private readonly IguanasDbContext _db;
    private readonly ILogger<OllamaAsistenteService> _logger;

    public OllamaAsistenteService(
        IHttpClientFactory httpClientFactory,
        IOptions<AsistenteOptions> options,
        IguanasDbContext db,
        ILogger<OllamaAsistenteService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options;
        _db = db;
        _logger = logger;
    }

    public bool Habilitado => _options.Value.Enabled;

    public async Task<IReadOnlyList<CatalogoAsistenteItem>> CatalogoAsync(string locale, CancellationToken cancellationToken)
    {
        var max = Math.Clamp(_options.Value.MaxPublicaciones, 1, 200);
        var useEnglish = locale == "en";

        // Only the fields a visitor already sees on the catalog page are
        // projected: the host row (email, phone) is deliberately left out.
        return await _db.Publicaciones
            .AsNoTracking()
            .Where(p => p.Estado == "activo")
            .OrderByDescending(p => p.CreatedAt)
            .Take(max)
            .Select(p => new CatalogoAsistenteItem(
                p.Id,
                p.Tipo,
                useEnglish && p.TituloEn != null && p.TituloEn != "" ? p.TituloEn : p.Titulo,
                useEnglish && p.DescripcionEn != null && p.DescripcionEn != "" ? p.DescripcionEn : p.Descripcion,
                p.Categoria != null ? p.Categoria.Nombre : "",
                p.Municipio != null ? p.Municipio.Nombre : "",
                p.Municipio != null && p.Municipio.Departamento != null ? p.Municipio.Departamento.Nombre : "",
                p.PrecioPorNoche,
                p.CapacidadMaxima))
            .ToListAsync(cancellationToken);
    }

    public async IAsyncEnumerable<string> TransmitirAsync(
        IReadOnlyList<CatalogoAsistenteItem> catalogo,
        IReadOnlyList<AsistenteTurno> historial,
        string mensaje,
        string locale,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var mensajes = new List<ChatMessage>(historial.Count + 2)
        {
            new("system", AsistentePrompt.Build(catalogo, locale)),
        };
        foreach (var turno in historial)
        {
            mensajes.Add(new ChatMessage(turno.Rol == "asistente" ? "assistant" : "user", turno.Texto ?? string.Empty));
        }
        mensajes.Add(new ChatMessage("user", mensaje));

        var request = new ChatRequest(
            _options.Value.Model,
            mensajes.ToArray(),
            Stream: true,
            new ChatOptions(0.3, Math.Clamp(_options.Value.MaxTokens, 50, 800)));

        using var response = await AbrirAsync(request, cancellationToken);
        if (response is null)
        {
            yield break;
        }

        if (!response.IsSuccessStatusCode)
        {
            LogFailure($"http_{(int)response.StatusCode}");
            yield break;
        }

        var stream = await AbrirStreamAsync(response, cancellationToken);
        if (stream is null)
        {
            yield break;
        }

        await using (stream)
        {
            using var reader = new StreamReader(stream);
            while (true)
            {
                var linea = await LeerLineaAsync(reader, cancellationToken);
                if (linea is null)
                {
                    yield break;
                }

                if (linea.Length == 0)
                {
                    continue;
                }

                ChatStreamChunk? chunk;
                try
                {
                    chunk = JsonSerializer.Deserialize<ChatStreamChunk>(linea, ChunkJson);
                }
                catch (JsonException)
                {
                    continue;
                }

                if (chunk?.Done == true)
                {
                    yield break;
                }

                var delta = chunk?.Message?.Content;
                if (!string.IsNullOrEmpty(delta))
                {
                    yield return delta;
                }
            }
        }
    }

    // A yield-return body cannot swallow its own HTTP errors, so each risky step
    // is a helper that logs the failure category and returns null instead.
    private async Task<HttpResponseMessage?> AbrirAsync(ChatRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return await _httpClientFactory
                .CreateClient(HttpClientName)
                .SendAsync(
                    new HttpRequestMessage(HttpMethod.Post, "api/chat") { Content = JsonContent.Create(request) },
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogFailure("timeout");
            return null;
        }
        catch (HttpRequestException)
        {
            LogFailure("unavailable");
            return null;
        }
    }

    private async Task<Stream?> AbrirStreamAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            return await response.Content.ReadAsStreamAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogFailure("timeout");
            return null;
        }
        catch (HttpRequestException)
        {
            LogFailure("stream_unavailable");
            return null;
        }
    }

    private async Task<string?> LeerLineaAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        try
        {
            return await reader.ReadLineAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogFailure("timeout");
            return null;
        }
        catch (IOException)
        {
            LogFailure("stream_broken");
            return null;
        }
        catch (HttpRequestException)
        {
            LogFailure("stream_broken");
            return null;
        }
    }

    private void LogFailure(string category) =>
        _logger.LogWarning("Assistant request failed: {FailureCategory}", category);

    private sealed record ChatRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("messages")] ChatMessage[] Messages,
        [property: JsonPropertyName("stream")] bool Stream,
        [property: JsonPropertyName("options")] ChatOptions Options);

    private sealed record ChatMessage(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string Content);

    private sealed record ChatOptions(
        [property: JsonPropertyName("temperature")] double Temperature,
        [property: JsonPropertyName("num_predict")] int NumPredict);

    private sealed class ChatStreamChunk
    {
        [JsonPropertyName("message")]
        public ChatMessage? Message { get; init; }

        [JsonPropertyName("done")]
        public bool Done { get; init; }
    }
}
