using Minio;
using Minio.DataModel.Args;

namespace IguanaSV.Api.Services;

public class MinioStorageService : IMinioStorageService
{
    private readonly IMinioClient _minio;
    private readonly string _bucket;
    private readonly string _publicEndpoint;

    public MinioStorageService(IConfiguration configuration)
    {
        var endpoint = configuration["Minio:Endpoint"];
        var accessKey = configuration["Minio:AccessKey"];
        var secretKey = configuration["Minio:SecretKey"];
        _bucket = configuration["Minio:BucketName"] ?? "rutasv";
        _publicEndpoint = (configuration["Minio:PublicEndpoint"] ?? $"http://{endpoint}").TrimEnd('/');

        _minio = new MinioClient()
            .WithEndpoint(endpoint)
            .WithCredentials(accessKey, secretKey)
            .WithSSL(false)
            .Build();
    }

    public async Task EnsureBucketExistsAsync(CancellationToken cancellationToken = default)
    {
        var exists = await _minio.BucketExistsAsync(
            new BucketExistsArgs().WithBucket(_bucket), cancellationToken);

        if (!exists)
        {
            await _minio.MakeBucketAsync(
                new MakeBucketArgs().WithBucket(_bucket), cancellationToken);
        }

        // Public-read-only policy for catalog images: an anonymous visitor must be
        // able to GET a listing photo, but NEVER PutObject/RemoveObject. Write and
        // delete are NOT exposed here — they are gated by [Authorize] on the upload
        // and delete routes plus the magic-byte/size validation in ImagenesController
        // (design W6). This policy deliberately grants only s3:GetObject; keeping it
        // public-read is intentional and the security guarantee is that the object
        // bytes are already validated server-side before they are ever stored.
        var policyJson = $@"{{
  ""Version"": ""2012-10-17"",
  ""Statement"": [
    {{
      ""Effect"": ""Allow"",
      ""Principal"": {{ ""AWS"": [""*""] }},
      ""Action"": [""s3:GetObject""],
      ""Resource"": [""arn:aws:s3:::{_bucket}/*""]
    }}
  ]
}}";

        await _minio.SetPolicyAsync(
            new SetPolicyArgs().WithBucket(_bucket).WithPolicy(policyJson), cancellationToken);
    }

    public async Task<string> UploadAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        // The object name and stored content type are derived from the file's real
        // magic bytes (the controller has already refused anything that is not an
        // allowed image). This ignores both the client-supplied extension and
        // file.ContentType, so a renamed executable or a double extension such as
        // "payload.php.jpg" can never be persisted or served back.
        var header = new byte[ImageSignature.HeaderBytes];
        await using (var head = file.OpenReadStream())
        {
            var read = await head.ReadAsync(header, cancellationToken);
            var detected = ImageSignature.Detect(header.AsSpan(0, read));
            if (ImageSignature.ExtensionOf(detected) is not { } extension
                || ImageSignature.ContentTypeOf(detected) is not { } contentType)
            {
                throw new InvalidOperationException(
                    "Refusing to store a file whose bytes are not an allowed image type.");
            }

            var fileName = $"{Guid.NewGuid():N}{extension}";

            await using var stream = file.OpenReadStream();

            await _minio.PutObjectAsync(
                new PutObjectArgs()
                    .WithBucket(_bucket)
                    .WithObject(fileName)
                    .WithStreamData(stream)
                    .WithObjectSize(file.Length)
                    .WithContentType(contentType),
                cancellationToken);

            return $"{_publicEndpoint}/{_bucket}/{fileName}";
        }
    }
    public async Task DeleteAsync(string fileName, CancellationToken cancellationToken = default)
    {
        await _minio.RemoveObjectAsync(
            new RemoveObjectArgs().WithBucket(_bucket).WithObject(fileName),
            cancellationToken);
    }

    public async Task<(Stream stream, string contentType)> GetAsync(string fileName, CancellationToken cancellationToken = default)
    {
        var ms = new MemoryStream();

        await _minio.GetObjectAsync(
            new GetObjectArgs()
                .WithBucket(_bucket)
                .WithObject(fileName)
                .WithCallbackStream(async (stream) =>
                {
                    await stream.CopyToAsync(ms, cancellationToken);
                }),
            cancellationToken);

        ms.Position = 0;

        var statArgs = new StatObjectArgs()
            .WithBucket(_bucket)
            .WithObject(fileName);
        var stat = await _minio.StatObjectAsync(statArgs, cancellationToken);

        return (ms, stat.ContentType ?? "application/octet-stream");
    }
}