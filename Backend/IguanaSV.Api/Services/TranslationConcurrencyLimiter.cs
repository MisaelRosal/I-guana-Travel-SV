namespace IguanaSV.Api.Services;

/// <summary>Bounds concurrent translation requests for the lifetime of this API process.</summary>
public sealed class TranslationConcurrencyLimiter : IDisposable
{
    private readonly SemaphoreSlim _semaphore = new(2, 2);

    internal SemaphoreSlim Semaphore => _semaphore;

    public void Dispose() => _semaphore.Dispose();
}
