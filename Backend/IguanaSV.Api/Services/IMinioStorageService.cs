namespace IguanaSV.Api.Services;

public interface IMinioStorageService
{
    Task EnsureBucketExistsAsync(CancellationToken cancellationToken = default);

    Task<string> UploadAsync(IFormFile file, CancellationToken cancellationToken = default);

    Task DeleteAsync(string fileName, CancellationToken cancellationToken = default);

    Task<(Stream stream, string contentType)> GetAsync(string fileName, CancellationToken cancellationToken = default);
}