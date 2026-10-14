namespace IguanaSV.Api.Services;

public interface IContentTranslationService
{
    Task<IReadOnlyList<string>?> TranslateBatchAsync(
        int contentId,
        string contentType,
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken);
}

public sealed class NoOpContentTranslationService : IContentTranslationService
{
    public static NoOpContentTranslationService Instance { get; } = new();

    private NoOpContentTranslationService() { }

    public Task<IReadOnlyList<string>?> TranslateBatchAsync(
        int contentId,
        string contentType,
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<string>?>(null);
}

public interface IPublicationTranslationService : IContentTranslationService
{
    Task<PublicationTranslationResult?> TranslateMissingAsync(
        int publicationId,
        string title,
        string? description,
        bool translateTitle,
        bool translateDescription,
        CancellationToken cancellationToken);
}

public sealed record PublicationTranslationResult(string? TitleEnglish, string? DescriptionEnglish);
