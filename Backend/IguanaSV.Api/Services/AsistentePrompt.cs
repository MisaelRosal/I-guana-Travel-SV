using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Services;

/// <summary>
/// Pure prompt assembly, kept free of DbContext and HTTP so it can be asserted
/// directly. The catalog arriving here is already PII-free by construction.
/// </summary>
public static class AsistentePrompt
{
    private const int MaxDescripcion = 160;

    public static string Build(IReadOnlyList<CatalogoAsistenteItem> items, string locale)
    {
        var en = locale == "en";
        var sb = new StringBuilder();

        sb.AppendLine("You are the travel assistant of I-Guana Travel SV, a marketplace of stays and experiences in El Salvador.");
        sb.AppendLine("Rules:");
        sb.AppendLine("- Answer ONLY from the CATALOG below. Never invent publications, prices, places or availability.");
        sb.AppendLine("- If nothing in the catalog matches, say so plainly and invite the user to browse the catalog page.");
        sb.AppendLine("- Recommend at most 3 options and quote each one's exact title so the user can find it.");
        sb.AppendLine("- Write short natural sentences. No tables, pipes or bracket labels.");
        sb.AppendLine("- Do not promise bookings or discounts: reservations happen on the publication page.");
        sb.AppendLine("- Prices are in USD: per night for stays, per person for experiences.");
        sb.AppendLine("- Reply in the language the user writes in. Keep it under 90 words, plain text, no markdown.");
        sb.AppendLine(en ? "- The site is being read in English." : "- The site is being read in Spanish.");
        sb.AppendLine("CATALOG:");

        if (items.Count == 0)
        {
            sb.AppendLine("(empty)");
            return sb.ToString();
        }

        foreach (var item in items)
        {
            // Written as prose on purpose: a small model sometimes repeats the
            // catalog line verbatim, and a readable line costs nothing extra.
            var esExperiencia = item.Tipo == "experiencia";
            sb.Append("- \"").Append(item.Titulo).Append('"').Append(" (").Append(item.Categoria).Append(") — ");
            if (item.Municipio.Length > 0 || item.Departamento.Length > 0)
            {
                sb.Append(item.Municipio);
                if (item.Municipio.Length > 0 && item.Departamento.Length > 0)
                {
                    sb.Append(", ");
                }
                sb.Append(item.Departamento).Append(". ");
            }

            sb.Append("USD ").Append(item.Precio.ToString("0.##"));
            if (en)
            {
                sb.Append(esExperiencia ? " per person" : " per night")
                    .Append(", up to ").Append(item.CapacidadMaxima).Append(" people.");
            }
            else
            {
                sb.Append(esExperiencia ? " por persona" : " por noche")
                    .Append(", hasta ").Append(item.CapacidadMaxima).Append(" personas.");
            }

            var descripcion = Resumen(item.Descripcion);
            if (descripcion.Length > 0)
            {
                sb.Append(' ').Append(descripcion);
            }

            sb.AppendLine();
        }

        return sb.ToString();
    }

    /// <summary>
    /// Publications whose title appears in the answer, resolved by matching the
    /// generated text against the injected catalog. Done here instead of asking
    /// the model for ids: a 3B model mangles structured output, substring
    /// matching does not.
    /// </summary>
    public static IReadOnlyList<AsistentePublicacion> BuscarMenciones(
        string texto,
        IReadOnlyList<CatalogoAsistenteItem> catalogo)
    {
        if (string.IsNullOrWhiteSpace(texto))
        {
            return Array.Empty<AsistentePublicacion>();
        }

        // Folded to plain lowercase letters on both sides: a small model often
        // drops the accent ("Cabana" for "Cabaña") and then the title is never
        // recognised, so the recommendation arrives without its link.
        var plano = SinTildes(texto);

        var encontradas = new List<AsistentePublicacion>();
        foreach (var item in catalogo)
        {
            if (item.Titulo.Length < 3)
            {
                continue;
            }

            // Whole-word match: the catalog holds titles like "asf" that would
            // otherwise match inside longer words.
            var patron = $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(SinTildes(item.Titulo))}(?![\p{{L}}\p{{N}}])";
            if (Regex.IsMatch(plano, patron))
            {
                encontradas.Add(new AsistentePublicacion(item.Id, item.Titulo));
            }

            if (encontradas.Count == 3)
            {
                break;
            }
        }

        return encontradas;
    }

    private static string SinTildes(string valor) =>
        new string(
                valor.Normalize(NormalizationForm.FormD)
                    .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                    .Select(char.ToLowerInvariant)
                    .ToArray())
            .Normalize(NormalizationForm.FormC);

    private static string Resumen(string? descripcion)
    {
        if (string.IsNullOrWhiteSpace(descripcion))
        {
            return string.Empty;
        }

        var plano = string.Join(' ', descripcion.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return plano.Length <= MaxDescripcion ? plano : plano[..MaxDescripcion] + "...";
    }
}
