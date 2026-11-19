namespace IguanaSV.Api.Services;

public sealed class AsistenteOptions
{
    public const string SectionName = "Asistente";

    public bool Enabled { get; set; }

    public string BaseUrl { get; set; } = "http://localhost:11434/";

    // Measured on CPU-only hardware: qwen2.5:3b answers the catalog questions in
    // ~3 s; a reasoning model (qwen3) spent 160-200 s per answer, so it is not
    // the default. Thinking models would also dump their chain of thought into
    // message.content here, because /api/chat is called without `think`.
    public string Model { get; set; } = "qwen2.5:3b";

    public int TimeoutSeconds { get; set; } = 60;

    // Bounds the injected catalog and therefore the prompt size (a CPU-bound
    // model pays for every input token too).
    public int MaxPublicaciones { get; set; } = 40;

    public int MaxMensajeLength { get; set; } = 500;

    public int MaxTokens { get; set; } = 220;
}
