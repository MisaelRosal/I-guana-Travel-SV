namespace IguanaSV.Api.Services;

public sealed class LibreTranslateOptions
{
    public const string SectionName = "Translation:LibreTranslate";

    public bool Enabled { get; set; }

    public string BaseUrl { get; set; } = "http://localhost:5501";

    public int TimeoutSeconds { get; set; } = 15;
}
