using IguanaSV.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace IguanaSV.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ImagenesController : ControllerBase
{
    private readonly IMinioStorageService _storage;

    public ImagenesController(IMinioStorageService storage)
    {
        _storage = storage;
    }

    [HttpPost("upload")]
    public async Task<IActionResult> Upload()
    {
        var files = Request.Form.Files;

        if (files.Count == 0)
        {
            return BadRequest("No se recibió ningún archivo.");
        }

        await _storage.EnsureBucketExistsAsync();

        var results = new List<object>();

        foreach (var file in files)
        {
            if (file.Length == 0)
            {
                continue;
            }

            var url = await _storage.UploadAsync(file);

            results.Add(new
            {
                url,
                fileName = Path.GetFileName(url),
                size = file.Length,
                contentType = file.ContentType
            });
        }

        if (results.Count == 0)
        {
            return BadRequest("Los archivos enviados están vacíos.");
        }

        return Ok(results);
    }

    [HttpDelete("{fileName}")]
    public async Task<IActionResult> Delete(string fileName)
    {
        await _storage.EnsureBucketExistsAsync();
        await _storage.DeleteAsync(fileName);

        return NoContent();
    }

    [HttpGet("{bucket}/{fileName}")]
    public async Task<IActionResult> GetImage(string bucket, string fileName)
    {
        try
        {
            var (stream, contentType) = await _storage.GetAsync(fileName);
            return File(stream, contentType);
        }
        catch
        {
            return NotFound();
        }
    }
}