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
        var extension = Path.GetExtension(file.FileName);
        var fileName = $"{Guid.NewGuid():N}{extension}";

        await using var stream = file.OpenReadStream();

        await _minio.PutObjectAsync(
            new PutObjectArgs()
                .WithBucket(_bucket)
                .WithObject(fileName)
                .WithStreamData(stream)
                .WithObjectSize(file.Length)
                .WithContentType(file.ContentType),
            cancellationToken);

        return $"{_publicEndpoint}/{_bucket}/{fileName}";
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