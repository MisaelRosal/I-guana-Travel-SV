using System.Security.Claims;
using System.Reflection;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Controllers;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Models;
using IguanaSV.Api.Services;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace IguanaSV.Api.Tests.Translation;

[Collection("AuthN")]
public sealed class PublicationTranslationPersistenceIntegrationTests
{
    private readonly AuthApiFixture _fixture;

    public PublicationTranslationPersistenceIntegrationTests(AuthApiFixture fixture) => _fixture = fixture;

    [SkippableFact]
    public async Task CreateAndUpdate_PersistEnglishOverlayAfterSourceAndKeepUnchangedFieldTranslation()
    {
        Skip.IfNot(_fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: publication translation integration test requires an ephemeral Postgres.");

        var (hostId, categoryId) = await CreateReferencesAsync();
        var translator = new RecordingTranslationService();
        translator.Enqueue(new PublicationTranslationResult("Beach house", "A walk along the coast"));
        translator.Enqueue(new PublicationTranslationResult("Updated beach house", null));
        translator.Enqueue(null); // Provider outage must not fail the source POST.

        int publicationId;
        await using (var db = CreateDbContext())
        {
            var controller = CreateController(db, translator);
            var created = await controller.PostPublicacione(CreateDto(hostId, categoryId, "Casa de playa", "Paseo por la costa"));
            var createdAction = Assert.IsType<CreatedAtActionResult>(created.Result);
            publicationId = Assert.IsType<Publicacione>(createdAction.Value).Id;
        }

        await using (var db = CreateDbContext())
        {
            var controller = CreateController(db, translator);
            var updated = await controller.PutPublicacione(
                publicationId,
                CreateDto(hostId, categoryId, "Casa renovada", "Paseo por la costa"));
            Assert.IsType<NoContentResult>(updated);
        }

        await using (var db = CreateDbContext())
        {
            var controller = CreateController(db, translator);
            var failedTranslationPost = await controller.PostPublicacione(
                CreateDto(hostId, categoryId, "Publicación sin traductor", "Texto fuente preservado"));
            Assert.IsType<CreatedAtActionResult>(failedTranslationPost.Result);
        }

        await using var verifyDb = CreateDbContext();
        var translatedPublication = await verifyDb.Publicaciones.AsNoTracking()
            .SingleAsync(publication => publication.Id == publicationId);
        Assert.Equal("Casa renovada", translatedPublication.Titulo);
        Assert.Equal("Updated beach house", translatedPublication.TituloEn);
        Assert.Equal("Paseo por la costa", translatedPublication.Descripcion);
        Assert.Equal("A walk along the coast", translatedPublication.DescripcionEn);

        var failedPublication = await verifyDb.Publicaciones.AsNoTracking()
            .SingleAsync(publication => publication.Titulo == "Publicación sin traductor");
        Assert.Equal("Texto fuente preservado", failedPublication.Descripcion);
        Assert.Null(failedPublication.TituloEn);
        Assert.Null(failedPublication.DescripcionEn);

        Assert.Collection(translator.Calls,
            call => Assert.True(call.TranslateTitle && call.TranslateDescription),
            call =>
            {
                Assert.True(call.TranslateTitle);
                Assert.False(call.TranslateDescription);
            },
            call => Assert.True(call.TranslateTitle && call.TranslateDescription));
    }

    [SkippableFact]
    public async Task Update_DoesNotPersistAResponseForAnOlderSourceSnapshot()
    {
        Skip.IfNot(_fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: publication translation integration test requires an ephemeral Postgres.");

        var (hostId, categoryId) = await CreateReferencesAsync();
        var publicationId = await CreatePublicationAsync(hostId, categoryId);
        var translator = new RecordingTranslationService();
        translator.Respond = async (call, cancellationToken) =>
        {
            await using var concurrentDb = CreateDbContext();
            await concurrentDb.Publicaciones
                .Where(publication => publication.Id == call.PublicationId)
                .ExecuteUpdateAsync(update => update.SetProperty(publication => publication.Titulo, "Newer source"), cancellationToken);
            return new PublicationTranslationResult("Stale English title", null);
        };

        await using (var db = CreateDbContext())
        {
            var controller = CreateController(db, translator);
            var result = await controller.PutPublicacione(
                publicationId,
                CreateDto(hostId, categoryId, "Intermediate source", "Unchanged description"));
            Assert.IsType<NoContentResult>(result);
        }

        await using var verifyDb = CreateDbContext();
        var publication = await verifyDb.Publicaciones.AsNoTracking()
            .SingleAsync(item => item.Id == publicationId);
        Assert.Equal("Newer source", publication.Titulo);
        Assert.Null(publication.TituloEn);
        Assert.Equal("Unchanged English description", publication.DescripcionEn);
        Assert.True(translator.Calls.Single().TranslateTitle);
        Assert.False(translator.Calls.Single().TranslateDescription);
    }

    [SkippableFact]
    public async Task AdminBackfill_StopsAtFirstFailureAndReturnsAResumableCursorWithoutText()
    {
        Skip.IfNot(_fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: publication translation integration test requires an ephemeral Postgres.");

        var (hostId, categoryId) = await CreateReferencesAsync();
        int afterId;
        int firstId;
        int secondId;
        await using (var seedDb = CreateDbContext())
        {
            afterId = await seedDb.Publicaciones.Select(publication => (int?)publication.Id)
                .MaxAsync() ?? 0;
            var first = NewPendingPublication(hostId, categoryId, "Pending title one");
            var second = NewPendingPublication(hostId, categoryId, "Pending title two");
            seedDb.Publicaciones.AddRange(first, second);
            await seedDb.SaveChangesAsync();
            firstId = first.Id;
            secondId = second.Id;
        }

        var authorize = typeof(PublicacioneController)
            .GetMethod(nameof(PublicacioneController.TranslatePending))!
            .GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal(AuthConstants.AdminRole, authorize?.Roles);

        var translator = new RecordingTranslationService();
        translator.Enqueue(new PublicationTranslationResult("English title one", "English description one"));
        translator.Enqueue(null);
        translator.Enqueue(new PublicationTranslationResult("English title two", "English description two"));

        await using (var db = CreateDbContext())
        {
            var controller = CreateController(db, translator);
            Assert.IsType<BadRequestObjectResult>(await controller.TranslatePending(26, afterId));

            var stopped = Assert.IsType<OkObjectResult>(await controller.TranslatePending(25, afterId));
            using var response = JsonDocument.Parse(JsonSerializer.Serialize(
                stopped.Value,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            var body = response.RootElement;
            Assert.Equal(1, body.GetProperty("processedCount").GetInt32());
            Assert.Equal(1, body.GetProperty("translatedCount").GetInt32());
            Assert.Equal(1, body.GetProperty("failedCount").GetInt32());
            Assert.Equal(firstId, body.GetProperty("nextAfterId").GetInt32());
            Assert.True(body.GetProperty("hasMore").GetBoolean());
            Assert.False(body.TryGetProperty("titulo", out _));
            Assert.False(body.TryGetProperty("descripcion", out _));

            var resumed = Assert.IsType<OkObjectResult>(await controller.TranslatePending(25, firstId));
            using var resumedResponse = JsonDocument.Parse(JsonSerializer.Serialize(
                resumed.Value,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            Assert.Equal(1, resumedResponse.RootElement.GetProperty("processedCount").GetInt32());
            Assert.Equal(secondId, resumedResponse.RootElement.GetProperty("nextAfterId").GetInt32());
            Assert.False(resumedResponse.RootElement.GetProperty("hasMore").GetBoolean());
        }

        await using var verifyDb = CreateDbContext();
        var persisted = await verifyDb.Publicaciones.AsNoTracking()
            .Where(publication => publication.Id == firstId || publication.Id == secondId)
            .OrderBy(publication => publication.Id)
            .ToListAsync();
        Assert.Equal("English title one", persisted[0].TituloEn);
        Assert.Equal("English title two", persisted[1].TituloEn);
        Assert.Equal(3, translator.Calls.Count);
    }

    private IguanasDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private async Task<(int HostId, int CategoryId)> CreateReferencesAsync()
    {
        await using var db = CreateDbContext();
        var suffix = Guid.NewGuid().ToString("N");
        var department = new Departamento { Nombre = $"Publication translation {suffix}" };
        var municipality = new Municipio { Nombre = $"Translation town {suffix}", Departamento = department };
        var host = new Anfitrione
        {
            Nombre = "Translation test host",
            Email = $"translation-{suffix}@test.local",
            Municipio = municipality,
        };
        var category = new Categoria { Nombre = $"Trans {suffix}", Tipo = "hospedaje" };
        db.Anfitriones.Add(host);
        db.Categorias.Add(category);
        await db.SaveChangesAsync();
        return (host.Id, category.Id);
    }

    private async Task<int> CreatePublicationAsync(int hostId, int categoryId)
    {
        await using var db = CreateDbContext();
        var publication = new Publicacione
        {
            AnfitrionId = hostId,
            CategoriaId = categoryId,
            Tipo = "hospedaje",
            Titulo = "Original source",
            Descripcion = "Unchanged description",
            TituloEn = "Original English title",
            DescripcionEn = "Unchanged English description",
            PrecioPorNoche = 12m,
            CapacidadMaxima = 2,
        };
        db.Publicaciones.Add(publication);
        await db.SaveChangesAsync();
        return publication.Id;
    }

    private static Publicacione NewPendingPublication(int hostId, int categoryId, string title) => new()
    {
        AnfitrionId = hostId,
        CategoriaId = categoryId,
        Tipo = "hospedaje",
        Titulo = title,
        Descripcion = "Synthetic source description",
        PrecioPorNoche = 12m,
        CapacidadMaxima = 2,
    };

    private static CreatePublicacioneDto CreateDto(int hostId, int categoryId, string title, string description) => new()
    {
        AnfitrionId = hostId,
        CategoriaId = categoryId,
        Tipo = "hospedaje",
        Titulo = title,
        Descripcion = description,
        PrecioPorNoche = 12m,
        CapacidadMaxima = 2,
    };

    private static PublicacioneController CreateController(
        IguanasDbContext db,
        RecordingTranslationService translator)
    {
        var controller = new PublicacioneController(
            db,
            new EmailStub(),
            translator,
            NullLogger<PublicacioneController>.Instance);
        var identity = new ClaimsIdentity(
            [new Claim(AuthConstants.RolClaim, AuthConstants.AdminRole)],
            authenticationType: "translation-test",
            nameType: AuthConstants.SubClaim,
            roleType: AuthConstants.RolClaim);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) },
        };
        return controller;
    }

    private sealed record TranslationCall(
        int PublicationId,
        string Title,
        string? Description,
        bool TranslateTitle,
        bool TranslateDescription);

    private sealed class RecordingTranslationService : IPublicationTranslationService
    {
        private readonly Queue<PublicationTranslationResult?> _results = new();

        public List<TranslationCall> Calls { get; } = new();

        public Func<TranslationCall, CancellationToken, Task<PublicationTranslationResult?>>? Respond { get; set; }

        public void Enqueue(PublicationTranslationResult? result) => _results.Enqueue(result);

        public Task<PublicationTranslationResult?> TranslateMissingAsync(
            int publicationId,
            string title,
            string? description,
            bool translateTitle,
            bool translateDescription,
            CancellationToken cancellationToken)
        {
            var call = new TranslationCall(publicationId, title, description, translateTitle, translateDescription);
            Calls.Add(call);
            return Respond is not null
                ? Respond(call, cancellationToken)
                : Task.FromResult(_results.Dequeue());
        }

        public Task<IReadOnlyList<string>?> TranslateBatchAsync(
            int contentId,
            string contentType,
            IReadOnlyList<string> texts,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<string>?>(null);
    }

    private sealed class EmailStub : IEmailNotificationService
    {
        public Task<bool> NotificarAsync(string destinatario, string asunto, string tipo, string html,
            int? usuarioId = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> VerificacionDeCorreoAsync(string destinatario, string nombre, string codigo,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> BienvenidaAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> CuentaCreadaAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SeAnfitrionAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> PerfilAnfitrionActualizadoAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> AnfitrionVerificadoAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> PublicacionCreadaAsync(string destinatario, string nombre, string titulo,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> ReservaCreadaAsync(string destinatario, string nombreHuesped, string tituloPublicacion,
            DateOnly fechaInicio, DateOnly fechaFin, int huespedes, decimal precioTotal,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> ResenaDisponibleAsync(string destinatario, string nombre, string tituloPublicacion,
            CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> ResenaRecibidaAsync(string destinatario, string nombreAnfitrion, string tituloPublicacion,
            short calificacion, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
