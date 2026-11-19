using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using Xunit;

namespace IguanaSV.Api.Tests;

public class AsistentePromptTests
{
    private static readonly CatalogoAsistenteItem Cabanas = new(
        7, "hospedaje", "Cabaña Lago", "Vista al lago", "Cabaña", "Suchitoto", "Cuscatlán", 45.5m, 4);

    [Fact]
    public void Build_IncludesTheCatalogAndNoHostContactData()
    {
        var prompt = AsistentePrompt.Build(new[] { Cabanas }, "es");

        Assert.Contains("Cabaña Lago", prompt);
        Assert.Contains("Suchitoto", prompt);
        Assert.Contains("Cuscatlán", prompt);
        Assert.Contains("45.5", prompt);
        // Contact data never reaches the prompt: the catalog DTO has no such field.
        Assert.DoesNotContain("@", prompt);
    }

    [Fact]
    public void Build_EmptyCatalog_IsExplicitlyEmpty()
    {
        Assert.Contains("(empty)", AsistentePrompt.Build(Array.Empty<CatalogoAsistenteItem>(), "es"));
    }

    [Fact]
    public void Build_TruncatesLongDescriptions()
    {
        var larga = new string('x', 500);

        var prompt = AsistentePrompt.Build(new[] { Cabanas with { Descripcion = larga } }, "es");

        Assert.DoesNotContain(larga, prompt);
        Assert.Contains("...", prompt);
    }

    [Fact]
    public void BuscarMenciones_ResolvesWholeWordTitlesOnly()
    {
        var catalogo = new[]
        {
            Cabanas,
            // Two-letter junk title from the real catalog: must not match inside words.
            Cabanas with { Id = 9, Titulo = "as" },
        };

        var menciones = AsistentePrompt.BuscarMenciones("Te recomiendo \"Cabaña Lago\" para descansar.", catalogo);

        Assert.Single(menciones);
        Assert.Equal(7, menciones[0].Id);
    }

    [Fact]
    public void BuscarMenciones_ReturnsNothingWhenNoTitleIsMentioned()
    {
        Assert.Empty(AsistentePrompt.BuscarMenciones("No hay opciones para eso.", new[] { Cabanas }));
    }

    [Fact]
    public void BuscarMenciones_MatchesTitlesWithoutAccents()
    {
        // The model usually copies the title, but a dropped tilde must not cost
        // the user their link.
        var menciones = AsistentePrompt.BuscarMenciones("te recomiendo CABANA lago para dos", new[] { Cabanas });

        Assert.Single(menciones);
        Assert.Equal(7, menciones[0].Id);
    }
}
