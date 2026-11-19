using IguanaSV.Api.Models;

namespace IguanaSV.Api.Services;

public interface IAsistenteService
{
    /// <summary>False when the feature is switched off by configuration.</summary>
    bool Habilitado { get; }

    /// <summary>Active catalog, already projected to public fields.</summary>
    Task<IReadOnlyList<CatalogoAsistenteItem>> CatalogoAsync(string locale, CancellationToken cancellationToken);

    /// <summary>
    /// Streams the answer token by token. Yields nothing when the model backend
    /// is unreachable, so the caller can report it without inventing content.
    /// </summary>
    IAsyncEnumerable<string> TransmitirAsync(
        IReadOnlyList<CatalogoAsistenteItem> catalogo,
        IReadOnlyList<AsistenteTurno> historial,
        string mensaje,
        string locale,
        CancellationToken cancellationToken);
}
