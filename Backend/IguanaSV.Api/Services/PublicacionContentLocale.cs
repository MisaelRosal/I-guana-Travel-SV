using PublicacioneEntity = IguanaSV.Api.Entities.Publicacione;

namespace IguanaSV.Api.Services;

/// <summary>
/// Single source of truth for the `contentLocale` contract on publications:
/// readers pass `contentLocale=es|en` and, when EN is active, the in-memory
/// projection swaps in the stored `*_en` columns before serialization. Extracted
/// from <c>PublicacioneController</c> so every publication-shaped read (catalog,
/// detail, saved publications in <c>FavoritoController</c>) applies the exact same
/// normalization and swap rules.
/// </summary>
public static class PublicacionContentLocale
{
    /// <summary>
    /// Normalizes the incoming query value (null/blank means ES, otherwise the
    /// value must be exactly `es` or `en`, case-insensitive). Returns false for
    /// anything else so callers can answer 400 with the shared message.
    /// </summary>
    public static bool TryNormalizeContentLocale(string? contentLocale, out string locale)
    {
        locale = string.IsNullOrWhiteSpace(contentLocale) ? "es" : contentLocale.Trim().ToLowerInvariant();
        return locale is "es" or "en";
    }

    public static void ApplyContentLocale(IEnumerable<PublicacioneEntity> publicaciones, string locale)
    {
        if (locale != "en")
        {
            return;
        }

        foreach (var publicacion in publicaciones)
        {
            ApplyContentLocale(publicacion, locale);
        }
    }

    public static void ApplyContentLocale(PublicacioneEntity publicacion, string locale)
    {
        if (locale != "en")
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(publicacion.TituloEn))
        {
            publicacion.Titulo = publicacion.TituloEn;
        }
        if (!string.IsNullOrWhiteSpace(publicacion.DescripcionEn))
        {
            publicacion.Descripcion = publicacion.DescripcionEn;
        }

        if (publicacion.Anfitrion is not null
            && !string.IsNullOrWhiteSpace(publicacion.Anfitrion.DescripcionEn))
        {
            publicacion.Anfitrion.Descripcion = publicacion.Anfitrion.DescripcionEn;
        }

        foreach (var experiencia in publicacion.Experiencia)
        {
            if (!string.IsNullOrWhiteSpace(experiencia.NombreEn)) experiencia.Nombre = experiencia.NombreEn;
            if (!string.IsNullOrWhiteSpace(experiencia.DescripcionEn)) experiencia.Descripcion = experiencia.DescripcionEn;
        }
    }
}
