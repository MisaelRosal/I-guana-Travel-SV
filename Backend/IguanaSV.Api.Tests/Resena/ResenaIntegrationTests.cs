using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Services;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace IguanaSV.Api.Tests.Resena;

/// <summary>
/// Vertical integration slice for the reviews feature. Drives the real pipeline
/// (cookie JWT + CSRF + [Authorize] + live FluentValidation) over HTTP against
/// the shared "AuthN" Testcontainers Postgres, and exercises the two background
/// workers' public passes directly. Proves, end-to-end, that:
///   * POST /api/Resena enforces every eligibility rule (owner, arrival day,
///     confirmed/completed, one review per reservation) with 400/404/409;
///   * the public detail/batch/host endpoints project averages and reviews
///     without leaking the guest's email;
///   * host replies (PUT {id}/respuesta) are owner-or-admin gated;
///   * GET mias scopes reviews to the caller's publications (admin sees all);
///   * ReservaCompletionService flips ended reservations to 'completada';
///   * ResenaAvailabilityService emails eligible guests once and stamps
///     resenas_notificadas_en only when the provider accepted the message.
/// </summary>
[Collection("AuthN")]
public sealed class ResenaIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public ResenaIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: Resena integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Requirement: eligibility on create -------------------------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Post_ConfirmadaLlegadaHoy_CreaResena_YSeReflejaEnElDetalle()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");

        var res = await AuthedClient(guest).PostAsync("/api/Resena", Json(new
        {
            reservaId,
            calificacion = 5,
            comentario = "Excelente experiencia, el anfitrión súper atento.",
        }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetInt32();
        Assert.Equal(5, doc.RootElement.GetProperty("calificacion").GetInt16());

        // The public detail endpoint now reports the average and the review.
        var detail = await Client().GetAsync($"/api/Resena/publicacion/{pubId}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var det = JsonDocument.Parse(await detail.Content.ReadAsStringAsync());
        Assert.Equal(5.0, det.RootElement.GetProperty("promedio").GetDouble());
        Assert.Equal(1, det.RootElement.GetProperty("total").GetInt32());
        var primera = det.RootElement.GetProperty("resenas")[0];
        Assert.Equal("Excelente experiencia, el anfitrión súper atento.",
            primera.GetProperty("comentario").GetString());
        Assert.True(primera.GetProperty("id").GetInt32() > 0);
    }

    [SkippableFact]
    [Trait("Category", "Translation")]
    public async Task LiveTranslator_LocalizesHostExperienceReviewAndHostReply()
    {
        var translatorUrl = Environment.GetEnvironmentVariable("LIBRETRANSLATE_TEST_URL");
        Skip.If(string.IsNullOrWhiteSpace(translatorUrl),
            "Set LIBRETRANSLATE_TEST_URL to run the live user-content translation test.");

        var hostUser = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var hostId = await SeedHostIdAsync(hostUser.UserId);
        var publicationId = await SeedPublicationAsync(hostId);
        var reservationId = await SeedReservaAsync(
            publicationId, guest.UserId, Iso(0), Iso(1), "confirmada", guest.Email);
        var overrides = new Dictionary<string, string?>
        {
            ["Translation:LibreTranslate:Enabled"] = "true",
            ["Translation:LibreTranslate:BaseUrl"] = translatorUrl,
        };

        using var translationFactory = new AuthApiFactory(overrides);
        using var hostClient = AuthedClient(translationFactory, hostUser);
        using var guestClient = AuthedClient(translationFactory, guest);

        const string hostAbout = "Guía local de café y senderos en Apan.";
        using var profileUpdate = await hostClient.PutAsync(
            "/api/Anfitrione/mi-perfil",
            Json(new { descripcion = hostAbout }));
        Assert.Equal(HttpStatusCode.OK, profileUpdate.StatusCode);

        const string experienceName = "Caminata entre fincas de café";
        const string experienceDescription = "Visitamos fincas familiares y aprendemos sobre el café local.";
        using var experienceCreate = await hostClient.PostAsync("/api/Experiencia", Json(new
        {
            publicacionId = publicationId,
            nombre = experienceName,
            descripcion = experienceDescription,
        }));
        Assert.Equal(HttpStatusCode.Created, experienceCreate.StatusCode);

        const string reviewComment = "La caminata fue hermosa y el café delicioso.";
        using var reviewCreate = await guestClient.PostAsync("/api/Resena", Json(new
        {
            reservaId = reservationId,
            calificacion = 5,
            comentario = reviewComment,
        }));
        Assert.Equal(HttpStatusCode.OK, reviewCreate.StatusCode);
        using var createdReview = JsonDocument.Parse(await reviewCreate.Content.ReadAsStringAsync());
        var reviewId = createdReview.RootElement.GetProperty("id").GetInt32();

        const string hostReply = "Muchas gracias por visitarnos; será un gusto recibirte de nuevo.";
        using var replyUpdate = await hostClient.PutAsync(
            $"/api/Resena/{reviewId}/respuesta",
            Json(new { respuesta = hostReply }));
        Assert.Equal(HttpStatusCode.OK, replyUpdate.StatusCode);

        await using (var db = NewDb())
        {
            var savedHost = await db.Anfitriones.AsNoTracking().SingleAsync(item => item.Id == hostId);
            var savedExperience = await db.Experiencias.AsNoTracking()
                .SingleAsync(item => item.PublicacionId == publicationId);
            var savedReview = await db.Resenas.AsNoTracking().SingleAsync(item => item.Id == reviewId);
            Assert.False(string.IsNullOrWhiteSpace(savedHost.DescripcionEn));
            Assert.False(string.IsNullOrWhiteSpace(savedExperience.NombreEn));
            Assert.False(string.IsNullOrWhiteSpace(savedExperience.DescripcionEn));
            Assert.False(string.IsNullOrWhiteSpace(savedReview.ComentarioEn));
            Assert.False(string.IsNullOrWhiteSpace(savedReview.RespuestaAnfitrionEn));
        }

        using var englishProfileResponse = await Client().GetAsync(
            $"/api/Anfitrione/{hostId}?contentLocale=en");
        Assert.Equal(HttpStatusCode.OK, englishProfileResponse.StatusCode);
        using var englishProfile = JsonDocument.Parse(await englishProfileResponse.Content.ReadAsStringAsync());
        var translatedAbout = englishProfile.RootElement.GetProperty("descripcion").GetString();
        Assert.False(string.IsNullOrWhiteSpace(translatedAbout));
        Assert.NotEqual(hostAbout, translatedAbout);

        using var englishPublicationResponse = await Client().GetAsync(
            $"/api/Publicacione/{publicationId}?contentLocale=en");
        Assert.Equal(HttpStatusCode.OK, englishPublicationResponse.StatusCode);
        using var englishPublication = JsonDocument.Parse(await englishPublicationResponse.Content.ReadAsStringAsync());
        var translatedExperience = englishPublication.RootElement.GetProperty("experiencia")[0];
        Assert.NotEqual(experienceName, translatedExperience.GetProperty("nombre").GetString());
        Assert.NotEqual(experienceDescription, translatedExperience.GetProperty("descripcion").GetString());

        using var englishReviewsResponse = await Client().GetAsync(
            $"/api/Resena/publicacion/{publicationId}?contentLocale=en");
        Assert.Equal(HttpStatusCode.OK, englishReviewsResponse.StatusCode);
        using var englishReviews = JsonDocument.Parse(await englishReviewsResponse.Content.ReadAsStringAsync());
        var translatedReview = englishReviews.RootElement.GetProperty("resenas")[0];
        Assert.NotEqual(reviewComment, translatedReview.GetProperty("comentario").GetString());
        Assert.NotEqual(hostReply, translatedReview.GetProperty("respuestaAnfitrion").GetString());
    }

    [SkippableFact]
    [Trait("Category", "Translation")]
    public async Task LiveTranslator_BackfillsPendingHostExperienceAndReviewTextInBoundedBatches()
    {
        var translatorUrl = Environment.GetEnvironmentVariable("LIBRETRANSLATE_TEST_URL");
        Skip.If(string.IsNullOrWhiteSpace(translatorUrl),
            "Set LIBRETRANSLATE_TEST_URL to run the live content backfill test.");

        var hostUser = await RegisterUserAsync();
        var guest = await RegisterUserAsync();
        var hostId = await SeedHostIdAsync(hostUser.UserId);
        var publicationId = await SeedPublicationAsync(hostId);
        var reservationId = await SeedReservaAsync(
            publicationId, guest.UserId, Iso(0), Iso(1), "confirmada", guest.Email);

        using (var hostClient = AuthedClient(hostUser))
        {
            using var profile = await hostClient.PutAsync("/api/Anfitrione/mi-perfil", Json(new
            {
                descripcion = "Anfitrión local para el backfill de prueba.",
            }));
            Assert.Equal(HttpStatusCode.OK, profile.StatusCode);

            using var experience = await hostClient.PostAsync("/api/Experiencia", Json(new
            {
                publicacionId = publicationId,
                nombre = "Ruta de prueba pendiente",
                descripcion = "Descripción sintética pendiente de traducción.",
            }));
            Assert.Equal(HttpStatusCode.Created, experience.StatusCode);
        }

        int reviewId;
        using (var guestClient = AuthedClient(guest))
        {
            using var review = await guestClient.PostAsync("/api/Resena", Json(new
            {
                reservaId = reservationId,
                calificacion = 5,
                comentario = "Comentario de prueba pendiente de traducción.",
            }));
            Assert.Equal(HttpStatusCode.OK, review.StatusCode);
            using var created = JsonDocument.Parse(await review.Content.ReadAsStringAsync());
            reviewId = created.RootElement.GetProperty("id").GetInt32();
        }

        using (var hostClient = AuthedClient(hostUser))
        {
            using var reply = await hostClient.PutAsync(
                $"/api/Resena/{reviewId}/respuesta",
                Json(new { respuesta = "Respuesta del anfitrión pendiente de traducción." }));
            Assert.Equal(HttpStatusCode.OK, reply.StatusCode);
        }

        var overrides = new Dictionary<string, string?>
        {
            ["Translation:LibreTranslate:Enabled"] = "true",
            ["Translation:LibreTranslate:BaseUrl"] = translatorUrl,
        };
        using var translationFactory = new AuthApiFactory(overrides);
        using var adminClient = AuthedClient(translationFactory, AdminSession());

        int experienceId;
        await using (var db = NewDb())
        {
            experienceId = await db.Experiencias
                .Where(item => item.PublicacionId == publicationId)
                .Select(item => item.Id)
                .SingleAsync();
        }

        foreach (var (tipo, id) in new[]
        {
            ("anfitriones", hostId),
            ("experiencias", experienceId),
            ("resenas", reviewId),
        })
        {
            using var backfill = await adminClient.PostAsync(
                $"/api/Traducciones/pendientes?tipo={tipo}&batchSize=1&afterId={id - 1}",
                content: null);
            Assert.Equal(HttpStatusCode.OK, backfill.StatusCode);
            using var result = JsonDocument.Parse(await backfill.Content.ReadAsStringAsync());
            Assert.Equal(1, result.RootElement.GetProperty("processedCount").GetInt32());
            Assert.Equal(1, result.RootElement.GetProperty("translatedCount").GetInt32());
            Assert.Equal(0, result.RootElement.GetProperty("failedCount").GetInt32());
            Assert.False(result.RootElement.TryGetProperty("comentario", out _));
        }

        await using var verifyDb = NewDb();
        var host = await verifyDb.Anfitriones.AsNoTracking().SingleAsync(item => item.Id == hostId);
        var experienceRecord = await verifyDb.Experiencias.AsNoTracking().SingleAsync(item => item.Id == experienceId);
        var reviewRecord = await verifyDb.Resenas.AsNoTracking().SingleAsync(item => item.Id == reviewId);
        Assert.False(string.IsNullOrWhiteSpace(host.DescripcionEn));
        Assert.False(string.IsNullOrWhiteSpace(experienceRecord.NombreEn));
        Assert.False(string.IsNullOrWhiteSpace(experienceRecord.DescripcionEn));
        Assert.False(string.IsNullOrWhiteSpace(reviewRecord.ComentarioEn));
        Assert.False(string.IsNullOrWhiteSpace(reviewRecord.RespuestaAnfitrionEn));
    }

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Post_Elegibilidad_Futura_Pendiente_Y_Cancelada_Rechazadas()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        var futura = await SeedReservaAsync(pubId, guest.UserId, Iso(5), Iso(6), "confirmada");
        var pendiente = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "pendiente");
        var cancelada = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "cancelada");

        var r1 = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId = futura, calificacion = 5 }));
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Contains("llegada", await r1.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

        var r2 = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId = pendiente, calificacion = 5 }));
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);

        var r3 = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId = cancelada, calificacion = 5 }));
        Assert.Equal(HttpStatusCode.BadRequest, r3.StatusCode);

        Assert.Equal(0, await CountResenasAsync(pubId));
    }

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Post_Duplicada_Returns409_YNoSeDuplica()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "completada");

        var first = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 4 }));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 1, comentario = "intentando duplicar" }));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        Assert.Equal(1, await CountResenasAsync(pubId));
    }

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Post_ResenaAjena_OInexistente_Returns404()
    {
        var owner = await RegisterUserAsync();
        var stranger = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var reservaId = await SeedReservaAsync(pubId, owner.UserId, Iso(0), Iso(1), "confirmada");

        // Someone else's reservation: 404 so its existence is not leaked.
        var strangerRes = await AuthedClient(stranger).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 1 }));
        Assert.Equal(HttpStatusCode.NotFound, strangerRes.StatusCode);

        var missingRes = await AuthedClient(owner).PostAsync("/api/Resena",
            Json(new { reservaId = 99999999, calificacion = 1 }));
        Assert.Equal(HttpStatusCode.NotFound, missingRes.StatusCode);

        Assert.Equal(0, await CountResenasAsync(pubId));
    }

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Post_SinSesion_Returns401()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");

        var res = await Client().PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 5 }));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(0, await CountResenasAsync(pubId));
    }

    // ---- Requirement: live FluentValidation on the DTO -------------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Post_CalificacionFueraDeRango_YComentarioLargo_Returns400()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");

        var fueraDeRango = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 6 }));
        Assert.Equal(HttpStatusCode.BadRequest, fueraDeRango.StatusCode);

        var negativa = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = -1 }));
        Assert.Equal(HttpStatusCode.BadRequest, negativa.StatusCode);

        var largo = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 3, comentario = new string('x', 501) }));
        Assert.Equal(HttpStatusCode.BadRequest, largo.StatusCode);

        Assert.Equal(0, await CountResenasAsync(pubId));
    }

    // ---- Requirement: public projections never leak guest PII ------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Get_Publicacion_Vacio_YConResenas_NoExponeEmailDelHuesped()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        // Empty state first.
        var vacio = await Client().GetAsync($"/api/Resena/publicacion/{pubId}");
        Assert.Equal(HttpStatusCode.OK, vacio.StatusCode);
        using var v = JsonDocument.Parse(await vacio.Content.ReadAsStringAsync());
        Assert.Equal(0, v.RootElement.GetProperty("total").GetInt32());
        Assert.Empty(v.RootElement.GetProperty("resenas").EnumerateArray());

        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");
        var post = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 3, comentario = "Regular" }));
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);

        var conResena = await Client().GetAsync($"/api/Resena/publicacion/{pubId}");
        var body = await conResena.Content.ReadAsStringAsync();
        Assert.DoesNotContain(guest.Email, body, StringComparison.OrdinalIgnoreCase);

        using var doc = JsonDocument.Parse(body);
        var primera = doc.RootElement.GetProperty("resenas")[0];
        Assert.Equal("Regular", primera.GetProperty("comentario").GetString());
        Assert.False(primera.TryGetProperty("email", out _));
        Assert.False(primera.TryGetProperty("usuarioId", out _));
    }

    // ---- Requirement: batch average for catalog cards --------------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Get_Resumen_SoloIncluyePublicacionesConResenas()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubCon = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var pubSin = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        var reservaId = await SeedReservaAsync(pubCon, guest.UserId, Iso(0), Iso(1), "confirmada");
        var post = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 4 }));
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);

        var res = await Client().GetAsync($"/api/Resena/resumen?publicaciones={pubCon},{pubSin}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());

        var mapa = doc.RootElement;
        Assert.True(mapa.TryGetProperty(pubCon.ToString(), out var entry));
        Assert.Equal(4.0, entry.GetProperty("promedio").GetDouble());
        Assert.Equal(1, entry.GetProperty("total").GetInt32());
        Assert.False(mapa.TryGetProperty(pubSin.ToString(), out _));
    }

    // ---- Requirement: host global rating ---------------------------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task Get_Anfitrion_PromedioGlobalDeSusPublicaciones()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var hostId = await SeedHostIdAsync(host.UserId);
        var pubA = await SeedPublicationAsync(hostId);
        var pubB = await SeedPublicationAsync(hostId);

        var resA = await SeedReservaAsync(pubA, guest.UserId, Iso(0), Iso(1), "confirmada");
        var resB = await SeedReservaAsync(pubB, guest.UserId, Iso(0), Iso(1), "confirmada");
        var client = AuthedClient(guest);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/Resena",
            Json(new { reservaId = resA, calificacion = 5 }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/Resena",
            Json(new { reservaId = resB, calificacion = 2 }))).StatusCode);

        var res = await Client().GetAsync($"/api/Resena/anfitrion/{hostId}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(3.5, doc.RootElement.GetProperty("promedio").GetDouble());
        Assert.Equal(2, doc.RootElement.GetProperty("total").GetInt32());
    }

    // ---- Requirement: host reply is owner-or-admin gated -----------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task PutRespuesta_Dueno_OK_Eligible_VaciaLimpia_Ajena403()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var stranger = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var reservaId = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada");

        var post = await AuthedClient(guest).PostAsync("/api/Resena",
            Json(new { reservaId, calificacion = 2, comentario = "Malo" }));
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        var resenaId = ReadId(post);

        // Non-owner (not even the guest) cannot reply.
        var forbidden = await AuthedClient(stranger)
            .PutAsync($"/api/Resena/{resenaId}/respuesta", Json(new { respuesta = "hola" }));
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        // Owner replies; the public projection shows it.
        var reply = await AuthedClient(host)
            .PutAsync($"/api/Resena/{resenaId}/respuesta", Json(new { respuesta = "¡Gracias por tus comentarios!" }));
        Assert.Equal(HttpStatusCode.OK, reply.StatusCode);

        var detail = await Client().GetAsync($"/api/Resena/publicacion/{pubId}");
        using var doc = JsonDocument.Parse(await detail.Content.ReadAsStringAsync());
        Assert.Equal("¡Gracias por tus comentarios!",
            doc.RootElement.GetProperty("resenas")[0].GetProperty("respuestaAnfitrion").GetString());

        // Admin may also reply.
        var adminReply = await AuthedClient(AdminSession())
            .PutAsync($"/api/Resena/{resenaId}/respuesta", Json(new { respuesta = "Respuesta del admin" }));
        Assert.Equal(HttpStatusCode.OK, adminReply.StatusCode);

        // An empty body clears the reply.
        var clear = await AuthedClient(host)
            .PutAsync($"/api/Resena/{resenaId}/respuesta", Json(new { respuesta = "   " }));
        Assert.Equal(HttpStatusCode.OK, clear.StatusCode);

        var after = await Client().GetAsync($"/api/Resena/publicacion/{pubId}");
        using var afterDoc = JsonDocument.Parse(await after.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null,
            afterDoc.RootElement.GetProperty("resenas")[0].GetProperty("respuestaAnfitrion").ValueKind);
    }

    // ---- Requirement: host inbox scoping ---------------------------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task GetMias_AnfitrionVeLoSuyo_AdminVeTodo_ConResumenesPorPublicacion()
    {
        var guest = await RegisterUserAsync();
        var hostA = await RegisterUserAsync();
        var hostB = await RegisterUserAsync();
        var pubA = await SeedPublicationAsync(await SeedHostIdAsync(hostA.UserId));
        var pubB = await SeedPublicationAsync(await SeedHostIdAsync(hostB.UserId));

        var resA = await SeedReservaAsync(pubA, guest.UserId, Iso(0), Iso(1), "confirmada");
        var resB = await SeedReservaAsync(pubB, guest.UserId, Iso(0), Iso(1), "confirmada");
        var client = AuthedClient(guest);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/Resena",
            Json(new { reservaId = resA, calificacion = 5, comentario = "A" }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/Resena",
            Json(new { reservaId = resB, calificacion = 1, comentario = "B" }))).StatusCode);

        // Host A: only their own review + their own summary row.
        var aRes = await AuthedClient(hostA).GetAsync("/api/Resena/mias");
        Assert.Equal(HttpStatusCode.OK, aRes.StatusCode);
        using var aDoc = JsonDocument.Parse(await aRes.Content.ReadAsStringAsync());
        Assert.Equal(1, aDoc.RootElement.GetProperty("resenas").GetArrayLength());
        Assert.Equal(1, aDoc.RootElement.GetProperty("resumenes").GetArrayLength());
        Assert.Equal(pubA, aDoc.RootElement.GetProperty("resumenes")[0].GetProperty("publicacionId").GetInt32());
        Assert.Equal("A", aDoc.RootElement.GetProperty("resenas")[0].GetProperty("comentario").GetString());
        Assert.Equal(5, aDoc.RootElement.GetProperty("resumenes")[0].GetProperty("promedio").GetDouble());

        // Admin: sees both of these reviews among every other row in the shared
        // database, so assert membership rather than an exact global count.
        var adminRes = await AuthedClient(AdminSession()).GetAsync("/api/Resena/mias");
        Assert.Equal(HttpStatusCode.OK, adminRes.StatusCode);
        using var adminDoc = JsonDocument.Parse(await adminRes.Content.ReadAsStringAsync());
        var comentarios = adminDoc.RootElement.GetProperty("resenas").EnumerateArray()
            .Select(e => e.GetProperty("comentario").GetString())
            .ToHashSet();
        Assert.Contains("A", comentarios);
        Assert.Contains("B", comentarios);
        var resumenIds = adminDoc.RootElement.GetProperty("resumenes").EnumerateArray()
            .Select(e => e.GetProperty("publicacionId").GetInt32())
            .ToHashSet();
        Assert.Contains(pubA, resumenIds);
        Assert.Contains(pubB, resumenIds);
    }

    // ---- Requirement: completion background worker ------------------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task CompletionService_MarcaCompletadas_SoloConfirmadasVencidas()
    {
        var user = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        var vencida = await SeedReservaAsync(pubId, user.UserId, Iso(-5), Iso(-2), "confirmada");
        var vigente = await SeedReservaAsync(pubId, user.UserId, Iso(1), Iso(3), "confirmada");
        var pendienteVencida = await SeedReservaAsync(pubId, user.UserId, Iso(-9), Iso(-7), "pendiente");

        var scopeFactory = _factory.Services.GetRequiredService<IServiceScopeFactory>();
        var service = new ReservaCompletionService(scopeFactory, NullLogger<ReservaCompletionService>.Instance);
        await service.MarcarCompletadasAsync(CancellationToken.None);

        Assert.Equal("completada", await ReadEstadoAsync(vencida));
        Assert.Equal("confirmada", await ReadEstadoAsync(vigente));
        Assert.Equal("pendiente", await ReadEstadoAsync(pendienteVencida));
    }

    // ---- Requirement: review availability background worker ---------------------

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task AvailabilityService_NotificaSoloCandidatasYMarca_SiElEnvioFueAceptado()
    {
        var guest = await RegisterUserAsync();
        var other = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));

        var elegible = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada",
            emailHuesped: guest.Email);
        // Disjoint [check-in, check-out) windows: the M3 exclusion constraint
        // forbids overlapping active reservations on the same publication.
        var yaNotificada = await SeedReservaAsync(pubId, other.UserId, Iso(-2), Iso(-1), "confirmada",
            emailHuesped: other.Email);
        await StampNotificadaAsync(yaNotificada);
        var fueraDeVentana = await SeedReservaAsync(pubId, guest.UserId, Iso(-10), Iso(-8), "confirmada",
            emailHuesped: guest.Email);
        var pendiente = await SeedReservaAsync(pubId, other.UserId, Iso(3), Iso(5), "pendiente",
            emailHuesped: other.Email);

        var stub = new EmailStub { ResponderCon = true };
        var (scopeFactory, _) = BuildScopeFactory(stub);
        var service = new ResenaAvailabilityService(scopeFactory, NullLogger<ResenaAvailabilityService>.Instance);
        await service.NotificarDisponiblesAsync(CancellationToken.None);

        // The eligible reservation was messaged; other rows in the shared
        // database may add calls to the recording stub, so match by recipient.
        Assert.Contains(stub.Disponibles, d => d.Destinatario == guest.Email);
        Assert.DoesNotContain(stub.Disponibles, d => d.Destinatario == other.Email);
        Assert.NotNull(await ReadNotificadaAsync(elegible));
        Assert.NotNull(await ReadNotificadaAsync(yaNotificada));
        Assert.Null(await ReadNotificadaAsync(fueraDeVentana));
        Assert.Null(await ReadNotificadaAsync(pendiente));
    }

    [SkippableFact]
    [Trait("Category", "Resena")]
    public async Task AvailabilityService_NoMarcaElSello_SiElProveedorRechazaElEnvio()
    {
        var guest = await RegisterUserAsync();
        var host = await RegisterUserAsync();
        var pubId = await SeedPublicationAsync(await SeedHostIdAsync(host.UserId));
        var elegible = await SeedReservaAsync(pubId, guest.UserId, Iso(0), Iso(1), "confirmada",
            emailHuesped: guest.Email);

        // Provider rejects: the stamp must stay null so the next tick retries.
        var stub = new EmailStub { ResponderCon = false };
        var (scopeFactory, _) = BuildScopeFactory(stub);
        var service = new ResenaAvailabilityService(scopeFactory, NullLogger<ResenaAvailabilityService>.Instance);
        await service.NotificarDisponiblesAsync(CancellationToken.None);

        // The send was attempted for this guest (other database rows may add
        // calls to the shared recording stub) but nothing was stamped.
        Assert.Contains(stub.Disponibles, d => d.Destinatario == guest.Email);
        Assert.Null(await ReadNotificadaAsync(elegible));
    }

    // ---- helpers -----------------------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

    /// <summary>Recording stand-in for the notification service (jobs scope only).</summary>
    private sealed class EmailStub : IEmailNotificationService
    {
        public bool ResponderCon { get; set; } = true;
        public List<(string Destinatario, string Titulo)> Disponibles { get; } = new();

        public Task<bool> ResenaDisponibleAsync(string destinatario, string nombre,
            string tituloPublicacion, CancellationToken cancellationToken = default)
        {
            Disponibles.Add((destinatario, tituloPublicacion));
            return Task.FromResult(ResponderCon);
        }

        public Task<bool> NotificarAsync(string destinatario, string asunto, string tipo, string html,
            int? usuarioId = null, CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> VerificacionDeCorreoAsync(string destinatario, string nombre, string codigo,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> BienvenidaAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> CuentaCreadaAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> SeAnfitrionAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> PerfilAnfitrionActualizadoAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> AnfitrionVerificadoAsync(string destinatario, string nombre,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> PublicacionCreadaAsync(string destinatario, string nombre, string titulo,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> ReservaCreadaAsync(string destinatario, string nombreHuesped,
            string tituloPublicacion, DateOnly fechaInicio, DateOnly fechaFin, int huespedes,
            decimal precioTotal, CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);

        public Task<bool> ResenaRecibidaAsync(string destinatario, string nombreAnfitrion,
            string tituloPublicacion, short calificacion,
            CancellationToken cancellationToken = default) => Task.FromResult(ResponderCon);
    }

    /// <summary>
    /// A self-contained DI scope (own DbContext + the stub) so the background
    /// worker's pass can be driven deterministically without touching the shared
    /// factory's service registrations.
    /// </summary>
    private (IServiceScopeFactory ScopeFactory, EmailStub Stub) BuildScopeFactory(EmailStub stub)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<IguanasDbContext>(options => options.UseNpgsql(_fixture.ConnectionString!));
        services.AddScoped<IEmailNotificationService>(_ => stub);
        var provider = services.BuildServiceProvider();
        return (provider.GetRequiredService<IServiceScopeFactory>(), stub);
    }

    private HttpClient Client() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

    private HttpClient AuthedClient(Session session)
    {
        return AuthedClient(_factory, session);
    }

    private static HttpClient AuthedClient(AuthApiFactory factory, Session session)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",
            $"{AuthConstants.AuthCookieName}={session.Auth}; {AuthConstants.CsrfCookieName}={session.Csrf}");
        client.DefaultRequestHeaders.TryAddWithoutValidation(AuthConstants.CsrfHeaderName, session.Csrf);
        return client;
    }

    private async Task<Session> RegisterUserAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Resena",
            apellido = "Tester",
            email,
            password = Password,
        }));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetInt32();
        return new Session(
            id,
            email,
            ParseCookie(res, AuthConstants.AuthCookieName).Value,
            ParseCookie(res, AuthConstants.CsrfCookieName).Value);
    }

    private Session AdminSession() =>
        new(UserId: 0, Email: "admin@resena.test", Auth: MintToken("0", "admin"), Csrf: NewCsrf());

    private string MintToken(string sub, string rol)
    {
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AuthApiFactory.TestJwtKey)),
            SecurityAlgorithms.HmacSha256);
        var now = DateTimeOffset.UtcNow;
        var token = new JwtSecurityToken(
            issuer: AuthApiFactory.TestIssuer,
            audience: AuthApiFactory.TestAudience,
            claims: new[] { new Claim(AuthConstants.SubClaim, sub), new Claim(AuthConstants.RolClaim, rol) },
            notBefore: now.UtcDateTime,
            expires: now.AddMinutes(60).UtcDateTime,
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string NewCsrf() => Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");

    private static string NewEmail() => $"u{Guid.NewGuid():N}@resena.test".ToLowerInvariant();

    private static ParsedCookie ParseCookie(HttpResponseMessage res, string name)
    {
        var raws = res.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.ToList()
            : new List<string>();
        foreach (var raw in raws)
        {
            var cookie = ParsedCookie.Parse(raw);
            if (string.Equals(cookie.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return cookie;
            }
        }
        throw new InvalidOperationException($"Response did not set a '{name}' cookie.");
    }

    private static StringContent Json(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    private static int ReadId(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        return doc.RootElement.GetProperty("id").GetInt32();
    }

    /// <summary>An ISO yyyy-MM-dd date offset from today.</summary>
    private static string Iso(int offsetDays) =>
        DateOnly.FromDateTime(DateTime.Today).AddDays(offsetDays).ToString("yyyy-MM-dd");

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private async Task<int> SeedHostIdAsync(int usuarioId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var departamento = new Departamento { Nombre = $"RDep {tag}" };
        var municipio = new Municipio { Nombre = $"RMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"RHost {tag}",
            Email = $"host{tag}@resena.test".ToLowerInvariant(),
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    private async Task<int> SeedPublicationAsync(int anfitrionId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var categoria = new Categoria { Nombre = $"RCat {tag}", Tipo = "experiencia" };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();

        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = "experiencia",
            Titulo = $"Resena W5 {tag}",
            Descripcion = "Seeded by the Resena slice.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 10,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();
        return publicacion.Id;
    }

    /// <summary>Seeds a reservation directly with an explicit state and dates.</summary>
    private async Task<int> SeedReservaAsync(
        int publicacionId, int? usuarioId, string inicio, string fin, string estado,
        string? emailHuesped = null)
    {
        var ini = DateOnly.Parse(inicio);
        var finD = DateOnly.Parse(fin);
        var nights = Math.Max(1, finD.DayNumber - ini.DayNumber);
        await using var db = NewDb();
        var reserva = new Reserva
        {
            PublicacionId = publicacionId,
            UsuarioId = usuarioId,
            NombreHuesped = "Resena Guest",
            EmailHuesped = emailHuesped ?? NewEmail(),
            FechaInicio = ini,
            FechaFin = finD,
            NumeroHuespedes = 1,
            PrecioTotal = 50m * nights,
            Estado = estado,
        };
        db.Reservas.Add(reserva);
        await db.SaveChangesAsync();
        return reserva.Id;
    }

    private async Task<int> CountResenasAsync(int publicacionId)
    {
        await using var db = NewDb();
        return await db.Resenas.CountAsync(r => r.PublicacionId == publicacionId);
    }

    private async Task<string?> ReadEstadoAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.Estado).FirstAsync();
    }

    private async Task<DateTime?> ReadNotificadaAsync(int id)
    {
        await using var db = NewDb();
        return await db.Reservas.Where(r => r.Id == id).Select(r => r.ResenasNotificadasEn).FirstAsync();
    }

    private async Task StampNotificadaAsync(int id)
    {
        await using var db = NewDb();
        var reserva = await db.Reservas.FindAsync(id)
            ?? throw new InvalidOperationException($"Reserva {id} not found.");
        reserva.ResenasNotificadasEn = DateTime.Now.AddMinutes(-3);
        await db.SaveChangesAsync();
    }
}
