using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ImagenesController : ControllerBase
{
    private readonly IMinioStorageService _storage;
    private readonly long _maxUploadBytes;

    public ImagenesController(IMinioStorageService storage, IConfiguration configuration)
    {
        _storage = storage;

        // Configurable per-file upload cap (design W6: reject oversize with 413
        // BEFORE storing). Read from config so it can be tuned per environment;
        // 5 MB is the product default when the key is missing or non-positive.
        _maxUploadBytes = configuration.GetValue<long?>("Minio:MaxUploadBytes") is > 0
            ? configuration.GetValue<long>("Minio:MaxUploadBytes")
            : 5 * 1024 * 1024;
    }

    // Spec: upload and delete are mutating routes and require a session
    // (W3b). W6 adds content validation on top of that gate.
    [HttpPost("upload")]
    [Authorize]
    public async Task<IActionResult> Upload()
    {
        var files = Request.Form.Files;

        if (files.Count == 0)
        {
            return BadRequest("No se recibió ningún archivo.");
        }

        // Validate the ENTIRE batch first; only after every file passes do we
        // store anything. That guarantees a rejected file (or a batch containing
        // one) is never written to MinIO (spec: "MUST NOT store it").
        var headers = new List<(IFormFile File, byte[] Header, int Read)>();

        foreach (var file in files)
        {
            if (file.Length == 0)
            {
                continue;
            }

            // 413 for oversize, checked against the real byte length and before
            // any storage call.
            if (file.Length > _maxUploadBytes)
            {
                return StatusCode(StatusCodes.Status413PayloadTooLarge,
                    new { error = $"El archivo excede el límite de {_maxUploadBytes} bytes." });
            }

            var header = new byte[ImageSignature.HeaderBytes];
            int read;
            await using (var stream = file.OpenReadStream())
            {
                read = await stream.ReadAsync(header, HttpContext.RequestAborted);
            }

            // 415: trust the magic bytes, never file.ContentType or the extension.
            if (ImageSignature.Detect(header.AsSpan(0, read)) == DetectedImage.None)
            {
                return StatusCode(StatusCodes.Status415UnsupportedMediaType,
                    new { error = "Solo se permiten imágenes JPEG, PNG, GIF o WEBP." });
            }

            headers.Add((file, header, read));
        }

        if (headers.Count == 0)
        {
            return BadRequest("Los archivos enviados están vacíos.");
        }

        await _storage.EnsureBucketExistsAsync();

        var results = new List<object>();

        foreach (var (file, _, _) in headers)
        {
            var url = await _storage.UploadAsync(file);

            results.Add(new
            {
                url,
                fileName = Path.GetFileName(url),
                size = file.Length,
                contentType = file.ContentType,
            });
        }

        return Ok(results);
    }

    [HttpDelete("{fileName}")]
    [Authorize]
    public async Task<IActionResult> Delete(string fileName)
    {
        // Sanitize against path traversal before touching the object store.
        if (!IsSafeObjectName(fileName))
        {
            return BadRequest("Nombre de archivo inválido.");
        }

        await _storage.EnsureBucketExistsAsync();
        await _storage.DeleteAsync(fileName);

        return NoContent();
    }

    // Public media read stays anonymous (the bucket is public-read by design —
    // see MinioStorageService.EnsureBucketExistsAsync and the upload-hardening
    // spec "Public read preserved"). W6 hardens the response itself: correct
    // Content-Type from the stored object, nosniff, and an inline
    // Content-Disposition; the {bucket} segment is kept for URL compatibility
    // (OD-3) but the object name is sanitized against traversal.
    [HttpGet("{bucket}/{fileName}")]
    public async Task<IActionResult> GetImage(string bucket, string fileName)
    {
        if (!IsSafeObjectName(fileName))
        {
            return BadRequest("Nombre de archivo inválido.");
        }

        try
        {
            var (stream, contentType) = await _storage.GetAsync(fileName);

            // Belt-and-braces: never let the browser sniff a stored object into
            // an executable/script type, and render images inline under a safe
            // filename only (no client-controlled disposition).
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            Response.Headers["Content-Disposition"] = $"inline; filename=\"{fileName}\"";

            return File(stream, contentType);
        }
        catch
        {
            return NotFound();
        }
    }

    /// <summary>
    /// True when <paramref name="fileName"/> is a bare, safe object key: no path
    /// separators, no parent-directory segments, no NUL, not hidden, and equal to
    /// its own file name (so traversal attempts such as <c>../x</c> or
    /// <c>a/b.png</c> are rejected before they reach the object store.
    /// </summary>
    private static bool IsSafeObjectName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return false;
        }

        if (fileName.Contains("..")
            || fileName.Contains('/')
            || fileName.Contains('\\')
            || fileName.Contains('\0')
            || fileName.StartsWith('.'))
        {
            return false;
        }

        return Path.GetFileName(fileName) == fileName;
    }
}
