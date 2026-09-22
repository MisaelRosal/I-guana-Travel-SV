namespace IguanaSV.Api.Services;

/// <summary>
/// Content types the upload pipeline treats as safe images. The value is the
/// authoritative MIME type stored with the object and served back on GET —
/// never the client-supplied <c>file.ContentType</c>.
/// </summary>
public enum DetectedImage
{
    None,
    Jpeg,
    Png,
    Gif,
    Webp,
}

/// <summary>
/// Signature sniffing for uploaded image bytes (design W6: "magic-byte
/// allowlist"). Only the leading bytes of a file are inspected and matched
/// against a fixed allowlist (jpeg/png/gif/webp) so a renamed executable, an
/// HTML/SVG payload, or any other mislabeled body is rejected independently of
/// the client-supplied extension and <c>Content-Type</c>. This is the single
/// source of truth for both the upload gate in <c>ImagenesController</c> (reject
/// non-images) and the storage layer (derive a safe object name and authoritative
/// content type from the real bytes).
/// </summary>
public static class ImageSignature
{
    /// <summary>
    /// Number of leading bytes needed to distinguish every allowed signature.
    /// The longest match is PNG (8-byte signature) and WEBP ("WEBP" at offset 8,
    /// so 12 bytes); we read 16 to have headroom for a single buffered read.
    /// </summary>
    public const int HeaderBytes = 16;

    /// <summary>Detect the real image type from the leading bytes of a file.</summary>
    public static DetectedImage Detect(ReadOnlySpan<byte> header)
    {
        // JPEG: FF D8 FF (Start Of Image marker).
        if (header.Length >= 3
            && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            return DetectedImage.Jpeg;
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A.
        ReadOnlySpan<byte> png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        if (header.Length >= png.Length && header[..png.Length].SequenceEqual(png))
        {
            return DetectedImage.Png;
        }

        // GIF: "GIF8" (covers GIF87a / GIF89a).
        ReadOnlySpan<byte> gif = new byte[] { 0x47, 0x49, 0x46, 0x38 };
        if (header.Length >= gif.Length && header[..gif.Length].SequenceEqual(gif))
        {
            return DetectedImage.Gif;
        }

        // WEBP: "RIFF" (0..3) ... "WEBP" (8..11).
        ReadOnlySpan<byte> riff = new byte[] { 0x52, 0x49, 0x46, 0x46 };
        ReadOnlySpan<byte> webp = new byte[] { 0x57, 0x45, 0x42, 0x50 };
        if (header.Length >= 12
            && header[..4].SequenceEqual(riff)
            && header.Slice(8, 4).SequenceEqual(webp))
        {
            return DetectedImage.Webp;
        }

        return DetectedImage.None;
    }

    /// <summary>Authoritative MIME type for a detected image, or null when not allowed.</summary>
    public static string? ContentTypeOf(DetectedImage image) => image switch
    {
        DetectedImage.Jpeg => "image/jpeg",
        DetectedImage.Png => "image/png",
        DetectedImage.Gif => "image/gif",
        DetectedImage.Webp => "image/webp",
        _ => null,
    };

    /// <summary>
    /// Canonical, single extension for a detected image. Used to build the stored
    /// object name so a double/executable extension supplied by the client
    /// (<c>evil.php.jpg</c>) can never be persisted or served.
    /// </summary>
    public static string? ExtensionOf(DetectedImage image) => image switch
    {
        DetectedImage.Jpeg => ".jpg",
        DetectedImage.Png => ".png",
        DetectedImage.Gif => ".gif",
        DetectedImage.Webp => ".webp",
        _ => null,
    };
}
