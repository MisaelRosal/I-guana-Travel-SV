using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Services;

public sealed class LibreTranslateTranslationService : IPublicationTranslationService, IContentTranslationService
{
    public const string HttpClientName = "libretranslate";
    private const int MaximumTitleLength = 200;
    private const int MaximumDescriptionLength = 1000;
    private const int MaximumBatchSize = 2;
    private const int MaximumTextLength = 1200;

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IOptions<LibreTranslateOptions> _options;
    private readonly TranslationConcurrencyLimiter _limiter;
    private readonly ILogger<LibreTranslateTranslationService> _logger;

    public LibreTranslateTranslationService(
        IHttpClientFactory httpClientFactory,
        IOptions<LibreTranslateOptions> options,
        TranslationConcurrencyLimiter limiter,
        ILogger<LibreTranslateTranslationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options;
        _limiter = limiter;
        _logger = logger;
    }

    public async Task<PublicationTranslationResult?> TranslateMissingAsync(
        int publicationId,
        string title,
        string? description,
        bool translateTitle,
        bool translateDescription,
        CancellationToken cancellationToken)
    {
        if (!_options.Value.Enabled)
        {
            return null;
        }

        var texts = new List<string>(2);
        var titleIndex = -1;
        var descriptionIndex = -1;

        if (translateTitle)
        {
            if (string.IsNullOrWhiteSpace(title) || title.Length > MaximumTitleLength)
            {
                LogFailure(publicationId, "publication", "invalid_title_length");
                return null;
            }

            titleIndex = texts.Count;
            texts.Add(title);
        }

        if (translateDescription && !string.IsNullOrWhiteSpace(description))
        {
            if (description.Length > MaximumDescriptionLength)
            {
                LogFailure(publicationId, "publication", "invalid_description_length");
                return null;
            }

            descriptionIndex = texts.Count;
            texts.Add(description);
        }

        if (texts.Count == 0)
        {
            return new PublicationTranslationResult(null, null);
        }

        var translated = await TranslateBatchAsync(publicationId, "publication", texts, cancellationToken);
        if (translated is null)
        {
            return null;
        }

        return new PublicationTranslationResult(
            titleIndex >= 0 ? translated[titleIndex] : null,
            descriptionIndex >= 0 ? translated[descriptionIndex] : null);
    }

    public async Task<IReadOnlyList<string>?> TranslateBatchAsync(
        int contentId,
        string contentType,
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken)
    {
        if (!_options.Value.Enabled)
        {
            return null;
        }

        if (texts.Count == 0)
        {
            return Array.Empty<string>();
        }

        if (texts.Count > MaximumBatchSize || texts.Any(text =>
                string.IsNullOrWhiteSpace(text) || text.Length > MaximumTextLength))
        {
            LogFailure(contentId, contentType, "invalid_batch");
            return null;
        }

        var acquired = false;
        try
        {
            await _limiter.Semaphore.WaitAsync(cancellationToken);
            acquired = true;

            using var response = await _httpClientFactory
                .CreateClient(HttpClientName)
                .PostAsJsonAsync("translate", new TranslateRequest(texts.ToArray(), "es", "en", "text"), cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                LogFailure(contentId, contentType, $"http_{(int)response.StatusCode}");
                return null;
            }

            var translated = await response.Content.ReadFromJsonAsync<TranslateResponse>(cancellationToken);
            if (translated is null || translated.TranslatedText.ValueKind != JsonValueKind.Array)
            {
                LogFailure(contentId, contentType, "invalid_response");
                return null;
            }

            var translatedTexts = translated.TranslatedText.EnumerateArray().ToArray();
            if (translatedTexts.Length != texts.Count
                || translatedTexts.Any(item => item.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(item.GetString())))
            {
                LogFailure(contentId, contentType, "invalid_response");
                return null;
            }

            return translatedTexts.Select(item => item.GetString()!).ToArray();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogFailure(contentId, contentType, "timeout");
            return null;
        }
        catch (HttpRequestException)
        {
            LogFailure(contentId, contentType, "unavailable");
            return null;
        }
        catch (JsonException)
        {
            LogFailure(contentId, contentType, "invalid_response");
            return null;
        }
        finally
        {
            if (acquired)
            {
                _limiter.Semaphore.Release();
            }
        }
    }

    private void LogFailure(int contentId, string contentType, string category) =>
        _logger.LogWarning(
            "Translation failed for {ContentType} {ContentId}: {FailureCategory}",
            contentType,
            contentId,
            category);

    private sealed record TranslateRequest(
        [property: JsonPropertyName("q")] string[] Q,
        [property: JsonPropertyName("source")] string Source,
        [property: JsonPropertyName("target")] string Target,
        [property: JsonPropertyName("format")] string Format);

    private sealed class TranslateResponse
    {
        [JsonPropertyName("translatedText")]
        public JsonElement TranslatedText { get; init; }
    }
}
