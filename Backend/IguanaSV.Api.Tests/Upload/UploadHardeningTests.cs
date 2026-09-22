using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Services;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace IguanaSV.Api.Tests.Upload;

/// <summary>
/// Vertical integration slice for the <c>upload-hardening</c> capability (W6).
/// Drives the real HTTP pipeline (W3a cookie JWT + CSRF, W3b [Authorize] on the
/// upload/delete routes) over multipart against the shared <c>AuthN</c> Testcontainers
/// fixture, but substitutes <see cref="IMinioStorageService"/> with an in-memory
/// <see cref="FakeStorage"/> so no MinIO server is required. The fake mirrors the
/// production storage rule — it derives the object name and authoritative content
/// type from the file's magic bytes — so the assertions about "not stored", the
/// stored object name, and the served Content-Type are meaningful end-to-end.
/// Traces: upload-hardening spec (magic-byte allowlist, size limit, safe
/// Content-Disposition, authenticated write/delete + public read).
/// </summary>
[Collection("AuthN")]
public sealed class UploadHardeningTests
{
    // Well-formed leading bytes for each allowed type. Payload bodies beyond the
    // signature are filler; the controller only inspects magic bytes and the fake
    // only reads the leading header, so a syntactically minimal file suffices.
    private static readonly byte[] JpegBytes =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01 };
    private static readonly byte[] PngBytes =
        { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D };
    private static readonly byte[] WebpBytes = BuildWebp();
    private static readonly byte[] GifBytes =
        "GIF89a".Select(c => (byte)c).Concat(new byte[] { 0x01, 0x00, 0x01, 0x00 }).ToArray();

    // HTML bytes masquerading as a .jpg — a real renamed-payload attack (spec:
    // "Renamed executable rejected"). Magic bytes are not any allowed signature.
    private static readonly byte[] FakeJpegBytes =
        Encoding.ASCII.GetBytes("<html><script>alert('xss')</script></html>");

    private readonly AuthApiFactory _factory;

    public UploadHardeningTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: upload integration tests skipped (environment).");
        _factory = fixture.Factory;
    }

    private static byte[] BuildWebp()
    {
        var b = new List<byte>();
        b.AddRange("RIFF"u8);
        b.AddRange(new byte[] { 0x24, 0x00, 0x00, 0x00 }); // chunk size
        b.AddRange("WEBP"u8);
        b.AddRange("VP8 "u8);
        b.AddRange(new byte[] { 0x18, 0x00, 0x00, 0x00 });
        b.AddRange(new byte[16]);
        return b.ToArray();
    }

    // ---- Requirement: Magic-byte type allowlist ---------------------------------

    [SkippableFact]
    [Trait("Category", "Upload")]
    public async Task FalseJpeg_HtmlBytes_Returns415_AndNotStored()
    {
        var (factory, storage) = NewHarness();
        var client = Authed(NewClient(factory));

        var res = await client.PostAsync("/api/Imagenes/upload",
            File(FakeJpegBytes, "payload.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, res.StatusCode);
        // Spec: a rejected upload MUST NOT be written to the object store.
        Assert.Empty(storage.Objects);
    }

    [SkippableTheory]
    [Trait("Category", "Upload")]
    [InlineData(0)] // jpeg
    [InlineData(1)] // png
    [InlineData(2)] // webp
    [InlineData(3)] // gif
    public async Task RealImage_Stored_AndServedWithCorrectTypeAndNosniff(int kind)
    {
        var (bytes, ext, expectedType) = kind switch
        {
            0 => (JpegBytes, ".jpg", "image/jpeg"),
            1 => (PngBytes, ".png", "image/png"),
            2 => (WebpBytes, ".webp", "image/webp"),
            _ => (GifBytes, ".gif", "image/gif"),
        };

        var (factory, storage) = NewHarness();
        var client = Authed(NewClient(factory));

        // The client lies about the type (executable-looking name + wrong MIME);
        // the magic bytes are a real image, so it must be accepted.
        var upload = await client.PostAsync("/api/Imagenes/upload",
            File(bytes, $"photo{ext}", "application/octet-stream"));
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);

        using var doc = JsonDocument.Parse(await upload.Content.ReadAsStringAsync());
        var fileName = doc.RootElement[0].GetProperty("fileName").GetString()!;

        // The stored object name is a GUID + the extension derived from the real
        // bytes, never the double/executable name the client supplied.
        Assert.EndsWith(ext, fileName);
        var stem = Path.GetFileNameWithoutExtension(fileName);
        Assert.Matches("^[0-9a-f]{32}$", stem); // Guid("N"): 32 hex chars, no client text
        Assert.True(storage.Objects.ContainsKey(fileName));
        Assert.Equal(expectedType, storage.Objects[fileName].ContentType);

        // Public read stays anonymous and carries nosniff + inline disposition +
        // the correct content type (the {bucket} segment is ignored but kept).
        // Same factory → same fake storage that holds the freshly-uploaded object.
        var anon = NewClient(factory);
        var get = await anon.GetAsync($"/api/Imagenes/rutasv/{fileName}");

        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.Equal(expectedType, get.Content.Headers.ContentType?.MediaType);
        Assert.Equal("nosniff", SingleHeader(get, "X-Content-Type-Options"));
        var disposition = SingleHeader(get, "Content-Disposition");
        Assert.StartsWith("inline", disposition);
        Assert.Contains(fileName, disposition);
    }

    // ---- Requirement: Upload size limit -----------------------------------------

    [SkippableFact]
    [Trait("Category", "Upload")]
    public async Task Oversize_Returns413_AndNotStored()
    {
        var (factory, storage) = NewHarness();
        var client = Authed(NewClient(factory));

        // Valid jpeg signature but larger than the configured 5 MB cap; proving the
        // size gate is independent of the type gate.
        var big = new byte[5 * 1024 * 1024 + 1024];
        JpegBytes.CopyTo(big, 0);

        var res = await client.PostAsync("/api/Imagenes/upload", File(big, "big.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, res.StatusCode);
        Assert.Empty(storage.Objects);
    }

    // ---- Requirement: Authenticated write and delete, public read ---------------

    [SkippableFact]
    [Trait("Category", "Upload")]
    public async Task AnonymousUpload_Returns401()
    {
        var (factory, storage) = NewHarness();
        var client = NewClient(factory); // no cookies

        var res = await client.PostAsync("/api/Imagenes/upload",
            File(JpegBytes, "photo.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Empty(storage.Objects);
    }

    [SkippableFact]
    [Trait("Category", "Upload")]
    public async Task AnonymousDelete_Returns401()
    {
        var (factory, _) = NewHarness();
        var client = NewClient(factory); // no cookies

        var res = await client.DeleteAsync("/api/Imagenes/whatever.png");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    // ---- DELETE sanitization against path traversal -----------------------------

    [SkippableFact]
    [Trait("Category", "Upload")]
    public async Task AuthedDelete_TraversalName_Returns400_AndNotForwarded()
    {
        var (factory, storage) = NewHarness();
        var client = Authed(NewClient(factory));

        // A traversal-flavored key must be refused before reaching the store, even
        // for an authenticated caller.
        var res = await client.DeleteAsync("/api/Imagenes/..%2Fsecret");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.DoesNotContain("../secret", storage.Deleted);
    }

    // ---- helpers ----------------------------------------------------------------

    /// <summary>
    /// A fresh derived factory whose real <see cref="IMinioStorageService"/> is
    /// replaced by an in-memory fake. Both the authenticated write client and the
    /// anonymous read client must be created from this same factory so they share
    /// the fake's state.
    /// </summary>
    private (WebApplicationFactory<Program> Factory, FakeStorage Storage) NewHarness()
    {
        var storage = new FakeStorage();
        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IMinioStorageService>();
                services.AddSingleton<IMinioStorageService>(storage);
            });
        });
        return (factory, storage);
    }

    private static HttpClient Authed(HttpClient client)
    {
        // Mint a valid token (test key) + a self-paired CSRF cookie/header, exactly
        // the technique the AuthZ slice uses for admin sessions.
        var token = MintToken("42", "anfitrion");
        var csrf = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={token}; {AuthConstants.CsrfCookieName}={csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, csrf);
        return client;
    }

    private static HttpClient NewClient(WebApplicationFactory<Program> factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

    private static string MintToken(string sub, string rol)
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

    private static MultipartFormDataContent File(byte[] bytes, string name, string contentType)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var form = new MultipartFormDataContent();
        form.Add(content, "image", name);
        return form;
    }

    private static string SingleHeader(HttpResponseMessage res, string name)
    {
        // HttpResponseMessage splits headers between the response collection and the
        // content collection (e.g. Content-Disposition/Content-Type live in Content).
        if (res.Headers.TryGetValues(name, out var rv))
        {
            Assert.Single(rv);
            return rv.First();
        }
        if (res.Content.Headers.TryGetValues(name, out var cv))
        {
            Assert.Single(cv);
            return cv.First();
        }
        Assert.Fail($"'{name}' missing from both response and content headers.");
        return string.Empty; // unreachable; keeps the return type for the compiler
    }

    /// <summary>
    /// In-memory stand-in for <see cref="MinioStorageService"/>: it records stored
    /// objects and, like production, derives the object name and stored content type
    /// from the real magic bytes (ignoring the client <c>file.ContentType</c>/name),
    /// so the HTTP assertions exercise the actual W6 guarantees without MinIO.
    /// </summary>
    private sealed class FakeStorage : IMinioStorageService
    {
        public Dictionary<string, (byte[] Data, string ContentType)> Objects { get; } = new();
        public List<string> Deleted { get; } = new();

        public Task EnsureBucketExistsAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<string> UploadAsync(IFormFile file, CancellationToken cancellationToken = default)
        {
            var header = new byte[ImageSignature.HeaderBytes];
            using (var head = file.OpenReadStream())
            {
                var read = head.Read(header, 0, header.Length);
                var detected = ImageSignature.Detect(header.AsSpan(0, read));
                var ext = ImageSignature.ExtensionOf(detected)
                    ?? throw new InvalidOperationException("FakeStorage received a non-image (should be gated upstream).");
                var contentType = ImageSignature.ContentTypeOf(detected)!;

                var fileName = $"{Guid.NewGuid():N}{ext}";
                using var ms = new MemoryStream();
                file.CopyTo(ms);
                Objects[fileName] = (ms.ToArray(), contentType);
                return Task.FromResult($"http://fake-storage/rutasv/{fileName}");
            }
        }

        public Task DeleteAsync(string fileName, CancellationToken cancellationToken = default)
        {
            Deleted.Add(fileName);
            Objects.Remove(fileName);
            return Task.CompletedTask;
        }

        public Task<(Stream stream, string contentType)> GetAsync(string fileName, CancellationToken cancellationToken = default)
        {
            if (!Objects.TryGetValue(fileName, out var obj))
            {
                throw new FileNotFoundException("object not found", fileName);
            }
            return Task.FromResult<(Stream, string)>((new MemoryStream(obj.Data), obj.ContentType));
        }
    }
}
