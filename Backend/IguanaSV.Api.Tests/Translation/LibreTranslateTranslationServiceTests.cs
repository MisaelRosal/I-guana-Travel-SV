using System.Net;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace IguanaSV.Api.Tests.Translation;

public sealed class LibreTranslateTranslationServiceTests
{
    [Fact]
    public async Task TranslateBatchAsync_TranslatesPublicTextFieldsAsOnePlainTextBatch()
    {
        using var factory = new FixedHttpClientFactory(new DelegateHandler((_, _) => Task.FromResult(
            JsonResponse("""{"translatedText":["A welcoming host","Near the beach"]}"""))));
        using var limiter = new TranslationConcurrencyLimiter();
        var service = CreateService(factory, enabled: true, limiter);

        var result = await service.TranslateBatchAsync(
            41, "host", ["Anfitrión muy atento", "Cerca de la playa"], CancellationToken.None);

        Assert.Equal(new[] { "A welcoming host", "Near the beach" }, result);
        Assert.Equal(1, factory.Handler.RequestCount);
        using var request = JsonDocument.Parse(factory.Handler.LastBody!);
        Assert.Equal("text", request.RootElement.GetProperty("format").GetString());
        Assert.Equal("es", request.RootElement.GetProperty("source").GetString());
        Assert.Equal("en", request.RootElement.GetProperty("target").GetString());
    }

    [Fact]
    public async Task TranslateBatchAsync_RejectsInputsOutsideTheProviderBatchLimit()
    {
        using var factory = new FixedHttpClientFactory(new DelegateHandler((_, _) => Task.FromResult(
            JsonResponse("""{"translatedText":["unused"]}"""))));
        using var limiter = new TranslationConcurrencyLimiter();
        var service = CreateService(factory, enabled: true, limiter);

        var result = await service.TranslateBatchAsync(
            42, "review", ["uno", "dos", "tres"], CancellationToken.None);

        Assert.Null(result);
        Assert.Equal(0, factory.Handler.RequestCount);
    }

    [Fact]
    public async Task TranslateMissingAsync_SendsMissingFieldsAsOneExplicitPlainTextBatch()
    {
        using var factory = new FixedHttpClientFactory(new DelegateHandler((_, _) => Task.FromResult(
            JsonResponse("""{"translatedText":["Beach stay","Walk the coast"]}"""))));
        using var limiter = new TranslationConcurrencyLimiter();
        var service = CreateService(factory, enabled: true, limiter);

        var result = await service.TranslateMissingAsync(
            31, "Hospedaje frente al mar", "Camina por la costa", true, true, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Beach stay", result.TitleEnglish);
        Assert.Equal("Walk the coast", result.DescriptionEnglish);
        Assert.Equal(1, factory.Handler.RequestCount);
        using var request = JsonDocument.Parse(factory.Handler.LastBody!);
        Assert.Equal(new[] { "Hospedaje frente al mar", "Camina por la costa" },
            request.RootElement.GetProperty("q").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal("es", request.RootElement.GetProperty("source").GetString());
        Assert.Equal("en", request.RootElement.GetProperty("target").GetString());
        Assert.Equal("text", request.RootElement.GetProperty("format").GetString());
    }

    [Fact]
    public async Task TranslateMissingAsync_OmitsBlankDescriptionAndOnlyTranslatesRequestedFields()
    {
        using var factory = new FixedHttpClientFactory(new DelegateHandler((_, _) => Task.FromResult(
            JsonResponse("""{"translatedText":["Coastal home"]}"""))));
        using var limiter = new TranslationConcurrencyLimiter();
        var service = CreateService(factory, enabled: true, limiter);

        var result = await service.TranslateMissingAsync(
            32, "Casa costera", "   ", true, true, CancellationToken.None);

        Assert.Equal("Coastal home", result?.TitleEnglish);
        Assert.Null(result?.DescriptionEnglish);
        using var request = JsonDocument.Parse(factory.Handler.LastBody!);
        Assert.Single(request.RootElement.GetProperty("q").EnumerateArray());
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable, "{}")]
    [InlineData(HttpStatusCode.OK, "{\"translatedText\":[]}")]
    [InlineData(HttpStatusCode.OK, "{\"translatedText\":[\" \"]}")]
    public async Task TranslateMissingAsync_RejectsFailureStatusAndInvalidResponseShapes(
        HttpStatusCode statusCode,
        string responseBody)
    {
        using var factory = new FixedHttpClientFactory(new DelegateHandler((_, _) => Task.FromResult(
            new HttpResponseMessage(statusCode) { Content = new StringContent(responseBody, Encoding.UTF8, "application/json") })));
        using var limiter = new TranslationConcurrencyLimiter();
        var service = CreateService(factory, enabled: true, limiter);

        var result = await service.TranslateMissingAsync(
            33, "Texto sintético", null, true, false, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task TranslateMissingAsync_DoesNotCallProviderForOversizedInputOrWhenDisabled()
    {
        using var factory = new FixedHttpClientFactory(new DelegateHandler((_, _) => Task.FromResult(
            JsonResponse("""{"translatedText":["ok"]}"""))));
        using var limiter = new TranslationConcurrencyLimiter();
        var enabledService = CreateService(factory, enabled: true, limiter);
        var disabledService = CreateService(factory, enabled: false, limiter);

        Assert.Null(await enabledService.TranslateMissingAsync(
            34, new string('x', 201), null, true, false, CancellationToken.None));
        Assert.Null(await disabledService.TranslateMissingAsync(
            35, "Texto sintético", null, true, false, CancellationToken.None));
        Assert.Equal(0, factory.Handler.RequestCount);
    }

    [SkippableFact]
    public async Task LiveLibreTranslateClient_TranslatesSyntheticSpanishTextWhenConfigured()
    {
        var baseUrl = Environment.GetEnvironmentVariable("LIBRETRANSLATE_TEST_URL");
        Skip.If(string.IsNullOrWhiteSpace(baseUrl), "Set LIBRETRANSLATE_TEST_URL to run the optional live translator check.");

        using var client = new HttpClient { BaseAddress = EnsureTrailingSlash(new Uri(baseUrl!)), Timeout = TimeSpan.FromSeconds(30) };
        using var factory = new FixedHttpClientFactory(client);
        using var limiter = new TranslationConcurrencyLimiter();
        var service = CreateService(factory, enabled: true, limiter);

        var result = await service.TranslateMissingAsync(
            36, "Una casa cerca de la playa", "Texto sintético para comprobar el servicio.", true, true, CancellationToken.None);

        Assert.False(string.IsNullOrWhiteSpace(result?.TitleEnglish));
        Assert.False(string.IsNullOrWhiteSpace(result?.DescriptionEnglish));
    }

    private static LibreTranslateTranslationService CreateService(
        IHttpClientFactory factory,
        bool enabled,
        TranslationConcurrencyLimiter limiter) => new(
            factory,
            Options.Create(new LibreTranslateOptions { Enabled = enabled }),
            limiter,
            NullLogger<LibreTranslateTranslationService>.Instance);

    private static HttpResponseMessage JsonResponse(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static Uri EnsureTrailingSlash(Uri uri) =>
        new(uri.AbsoluteUri.TrimEnd('/') + "/");

    private sealed class FixedHttpClientFactory : IHttpClientFactory, IDisposable
    {
        private readonly HttpClient _client;
        private readonly DelegateHandler? _handler;

        public FixedHttpClientFactory(DelegateHandler handler)
        {
            _handler = handler;
            _client = new HttpClient(handler) { BaseAddress = new Uri("http://translator.test/") };
        }

        public FixedHttpClientFactory(HttpClient client)
        {
            _handler = null;
            _client = client;
        }

        public DelegateHandler Handler => _handler
            ?? throw new InvalidOperationException("The live client factory does not expose a fake handler.");

        public HttpClient CreateClient(string name) => _client;

        public void Dispose()
        {
            if (_handler is not null)
            {
                _client.Dispose();
            }
        }
    }

    private sealed class DelegateHandler(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            LastBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return await respond(request, cancellationToken);
        }
    }
}
