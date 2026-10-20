using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using IguanaSV.Api.Auth;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using IguanaSV.Api.Tests.AuthN;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace IguanaSV.Api.Tests.Chat;

/// <summary>
/// Vertical integration slice for the host↔traveler chat over the real pipeline
/// (cookie JWT + CSRF + [Authorize] + live FluentValidation) against the shared
/// "AuthN" Testcontainers Postgres. Proves every pinned spec scenario:
///   * open-or-get creates once, returns the same row, races into a Spanish 409
///     with retry (THM1–4), and fails closed on NULL/unknown host bindings (ACC6);
///   * the subject claim alone addresses a pair — a spoofed traveler id is
///     ignored (ACC3);
///   * sends are capped at 500 by validator + DB check, stored verbatim, and
///     stamp the shared inbox preview (THM5–7);
///   * optional publicacion_id is stored and projected as a card (THM8/THM9);
///   * history is keyset over (creado_en, id): 51 rows → 50 + cursor → 1, no
///     gaps or duplicates; content passes through untranslated (THM10–12);
///   * foreign conversation ids are 404 for page/send/read-mark/direct fetch,
///     participants get 2xx, admins get nothing extra, anonymous callers hit the
///     existing 401 surface without writing rows (ACC1/ACC2/ACC4/ACC5/ACC8);
///   * the inbox scopes to participation, unread derives from the last-read
///     stamps, and a read-mark advances only the caller (INB1–6);
///   * repeated valid sends are never throttled (no 429 in v1).
/// </summary>
[Collection("AuthN")]
public sealed class ChatIntegrationTests
{
    private const string Password = "Secret123!";

    private readonly AuthApiFixture _fixture;
    private readonly AuthApiFactory _factory;

    public ChatIntegrationTests(AuthApiFixture fixture)
    {
        Skip.IfNot(fixture.DockerAvailable,
            "Docker/Testcontainers unavailable: Chat integration tests skipped (environment).");
        _fixture = fixture;
        _factory = fixture.Factory;
    }

    // ---- Requirement: open-or-get pair conversation (THM1–4) ---------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task AbrirPorPrimeraVez_CreaConversacion_YRespondeSnakeCase()
    {
        var viajero = await RegistrarUsuarioAsync();
        var host = await SembrarHostDe(viajero);

        var res = await AuthedClient(viajero).GetAsync($"/api/Chat/anfitrion/{host.anfitrionId}");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.Equal(viajero.UserId, root.GetProperty("viajero_usuario_id").GetInt32());
        Assert.Equal(host.anfitrionId, root.GetProperty("anfitrion_id").GetInt32());
        Assert.True(root.GetProperty("id").GetInt32() > 0);
        Assert.True(root.TryGetProperty("creado_en", out _));
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task SegundaApertura_DevuelveLaMismaConversacion_SinDuplicar()
    {
        var viajero = await RegistrarUsuarioAsync();
        var host = await SembrarHostDe(viajero);
        var cliente = AuthedClient(viajero);

        var primero = await cliente.GetAsync($"/api/Chat/anfitrion/{host.anfitrionId}");
        var segunda = await cliente.GetAsync($"/api/Chat/anfitrion/{host.anfitrionId}");

        Assert.Equal(HttpStatusCode.OK, primero.StatusCode);
        Assert.Equal(HttpStatusCode.OK, segunda.StatusCode);
        var id1 = LeerId(primero);
        var id2 = LeerId(segunda);
        Assert.Equal(id1, id2);

        await using var db = NewDb();
        Assert.Equal(1, await db.Conversaciones.CountAsync(c => c.Id == id1));
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task CarreraCreacion_Paralela_UnoGana_ElPerdedorRecibe409Reintentable()
    {
        var viajero = await RegistrarUsuarioAsync();
        var host = await SembrarHostDe(viajero);
        var cliente = AuthedClient(viajero);

        var t1 = cliente.GetAsync($"/api/Chat/anfitrion/{host.anfitrionId}");
        var t2 = cliente.GetAsync($"/api/Chat/anfitrion/{host.anfitrionId}");
        await Task.WhenAll(t1, t2);

        var respuestas = new[] { t1.Result, t2.Result };
        Assert.DoesNotContain(respuestas, r => r.StatusCode == HttpStatusCode.InternalServerError);

        // Invariant: the unique pair index admits exactly one row; the loser
        // either saw it (200, same id) or got the pinned Spanish 409 whose
        // retry returns the pair.
        await using (var db = NewDb())
        {
            Assert.Equal(1, await db.Conversaciones.CountAsync(
                c => c.ViajeroUsuarioId == viajero.UserId && c.AnfitrionId == host.anfitrionId));
        }

        var exitos = respuestas.Where(r => r.StatusCode == HttpStatusCode.OK).ToList();
        Assert.NotEmpty(exitos);

        foreach (var conflicto in respuestas.Where(r => r.StatusCode == HttpStatusCode.Conflict))
        {
            var cuerpo = await conflicto.Content.ReadAsStringAsync();
            Assert.Contains("mensaje", cuerpo);
            var reintento = await cliente.GetAsync($"/api/Chat/anfitrion/{host.anfitrionId}");
            Assert.Equal(HttpStatusCode.OK, reintento.StatusCode);
        }

        var ids = await Task.WhenAll(exitos.Select(async r =>
            JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetInt32()));
        Assert.Single(ids.Distinct());
    }

    // ---- Requirement: fail-closed host resolution (NULL binding, no host row) ----

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task HostSinUsuarioVinculado_Responde404_NoCreaFila()
    {
        var viajero = await RegistrarUsuarioAsync();
        var hostHuerfano = await SembrarHostSinVinculoAsync();

        var res = await AuthedClient(viajero).GetAsync($"/api/Chat/anfitrion/{hostHuerfano}");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        var cuerpo = await res.Content.ReadAsStringAsync();
        Assert.Contains("mensaje", cuerpo);

        await using var db = NewDb();
        Assert.Equal(0, await db.Conversaciones.CountAsync(c => c.AnfitrionId == hostHuerfano));
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task DestinoSinFilaAnfitrion_Responde404_NoCreaFila()
    {
        var viajero = await RegistrarUsuarioAsync();

        var res = await AuthedClient(viajero).GetAsync("/api/Chat/anfitrion/999999");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        await using var db = NewDb();
        Assert.Equal(0, await db.Conversaciones.CountAsync(c => c.AnfitrionId == 999999));
    }

    // ---- Requirement: send capped message (THM5–7) -------------------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task HostResponde_201_SeConvierteEnPreview_EnAmbasBandejas()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        var viaje = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes",
            Json(new { mensaje = "Hola, ¿tienen disponibilidad la próxima semana?" }));
        Assert.Equal(HttpStatusCode.Created, viaje.StatusCode);

        var respuesta = await AuthedClient(hostSesion).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes",
            Json(new { mensaje = "Sí, quedan dos cupos." }));
        Assert.Equal(HttpStatusCode.Created, respuesta.StatusCode);
        using var body = JsonDocument.Parse(await respuesta.Content.ReadAsStringAsync());
        Assert.Equal("Sí, quedan dos cupos.", body.RootElement.GetProperty("mensaje").GetString());
        Assert.Equal(hostSesion.UserId, body.RootElement.GetProperty("emisor_usuario_id").GetInt32());

        foreach (var parte in new[] { viajero, hostSesion.Sesion })
        {
            using var doc = await LeerJsonAsync(AuthedClient(parte).GetAsync("/api/Chat/mias"));
            var fila = doc.RootElement.EnumerateArray()
                .Single(h => h.GetProperty("conversacion_id").GetInt32() == conversacionId);
            Assert.Equal("Sí, quedan dos cupos.", fila.GetProperty("ultimo_mensaje_texto").GetString());
            Assert.True(fila.TryGetProperty("ultimo_mensaje_en", out var en) && en.ValueKind == JsonValueKind.String);
        }
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task MensajeDeExactamente500_SeAcepta_YSeGuardaVerbatim()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        var texto = new string('á', 500);

        var res = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = texto }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        using var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(texto, body.RootElement.GetProperty("mensaje").GetString());

        await using var db = NewDb();
        var guardado = await db.Mensajes.AsNoTracking().FirstAsync(m => m.Id == body.RootElement.GetProperty("id").GetInt32());
        Assert.Equal(texto, guardado.Texto);
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task Oversize_O_OnlyWhitespace_Responde400_NoPersisteNada()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        await using (var db = NewDb())
        {
            Assert.Equal(0, await db.Mensajes.CountAsync(m => m.ConversacionId == conversacionId));
        }

        var largo = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = new string('a', 501) }));
        var vacio = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "   " }));
        var nulo = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "" }));

        foreach (var res in new[] { largo, vacio, nulo })
        {
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            var cuerpo = await res.Content.ReadAsStringAsync();
            Assert.Contains("mensaje", cuerpo); // Spanish error body from the validator
        }

        await using var db2 = NewDb();
        Assert.Equal(0, await db2.Mensajes.CountAsync(m => m.ConversacionId == conversacionId));
    }

    // ---- Requirement: per-message publication context (THM8–9) -------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task EnviarDesdePublicacion_GuardaPublicacionId_YProyectaTarjeta()
    {
        var (viajero, hostSesion, publicacionId, titulo) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        var res = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes",
            Json(new { mensaje = "Me interesa esta experiencia.", publicacion_id = publicacionId }));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        using var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(publicacionId, body.RootElement.GetProperty("publicacion_id").GetInt32());
        var tarjeta = body.RootElement.GetProperty("publicacion");
        Assert.Equal(publicacionId, tarjeta.GetProperty("id").GetInt32());
        Assert.Equal(titulo, tarjeta.GetProperty("titulo").GetString());
        Assert.Equal(50m, tarjeta.GetProperty("precio").GetDecimal());

        await using var db = NewDb();
        var guardado = await db.Mensajes.FirstAsync(m => m.Id == body.RootElement.GetProperty("id").GetInt32());
        Assert.Equal(publicacionId, guardado.PublicacionId);
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task EnviarDesdePerfilSinContexto_PublicacionIdNulo_SinTarjeta()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        var res = await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "Hola, una consulta general." }));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        using var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, body.RootElement.GetProperty("publicacion_id").ValueKind);
        Assert.Equal(JsonValueKind.Null, body.RootElement.GetProperty("publicacion").ValueKind);
    }

    // ---- Requirement: keyset-paginated history (THM10–11) ------------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task PaginaClave_51Mensajes_PrimeraPegada50_MasCursor_HastaCierre()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        var idsSembrados = await SembrarMensajesAsync(conversacionId, viajero.UserId, 51);

        using var p1 = await LeerJsonAsync(
            AuthedClient(viajero).GetAsync($"/api/Chat/{conversacionId}/mensajes"));
        var primera = p1.RootElement.GetProperty("mensajes").EnumerateArray().ToList();
        Assert.Equal(50, primera.Count);
        Assert.Equal(idsSembrados.Max(), primera[0].GetProperty("id").GetInt32());
        foreach (var par in primera.Zip(primera.Skip(1)))
        {
            var (más, menos) = par;
            var cmp = string.CompareOrdinal(
                más.GetProperty("creado_en").GetString(), menos.GetProperty("creado_en").GetString());
            Assert.True(cmp > 0
                || (cmp == 0 && más.GetProperty("id").GetInt32() > menos.GetProperty("id").GetInt32()));
        }

        var cursor = p1.RootElement.GetProperty("cursor");
        Assert.Equal(JsonValueKind.Object, cursor.ValueKind);

        var antesDe = Uri.EscapeDataString(cursor.GetProperty("before_creado_en").GetString()!);
        var antesId = cursor.GetProperty("before_id").GetInt32();
        using var p2 = await LeerJsonAsync(AuthedClient(viajero).GetAsync(
            $"/api/Chat/{conversacionId}/mensajes?before_creado_en={antesDe}&before_id={antesId}"));
        var segunda = p2.RootElement.GetProperty("mensajes").EnumerateArray().ToList();
        Assert.Single(segunda);
        Assert.Equal(idsSembrados.Min(), segunda[0].GetProperty("id").GetInt32());
        Assert.Equal(JsonValueKind.Null, p2.RootElement.GetProperty("cursor").ValueKind);

        var vistos = primera.Concat(segunda).Select(m => m.GetProperty("id").GetInt32()).ToList();
        Assert.Equal(51, vistos.Distinct().Count()); // no duplicates and no gaps
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task CursorParcial_SoloUnaMitad_Responde400()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        await SembrarMensajesAsync(conversacionId, viajero.UserId, 2);

        var conId = await AuthedClient(viajero).GetAsync(
            $"/api/Chat/{conversacionId}/mensajes?before_id=7");
        var conFecha = await AuthedClient(viajero).GetAsync(
            $"/api/Chat/{conversacionId}/mensajes?before_creado_en={Uri.EscapeDataString("2026-01-01T00:00:00")}");

        Assert.Equal(HttpStatusCode.BadRequest, conId.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, conFecha.StatusCode);
    }

    // ---- Requirement: original-language storage (THM12) --------------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task Passthrough_LectorIngles_CuerposEspañoles_Verbatim()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        const string original = "El sendero sale al amanecer desde el pueblo.";

        await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = original }));

        using var pagina = await LeerJsonAsync(
            AuthedClient(hostSesion).GetAsync($"/api/Chat/{conversacionId}/mensajes?contentLocale=en"));
        var mensaje = pagina.RootElement.GetProperty("mensajes")[0];
        Assert.Equal(original, mensaje.GetProperty("mensaje").GetString());

        using var inbox = await LeerJsonAsync(
            AuthedClient(hostSesion).GetAsync("/api/Chat/mias"));
        var fila = inbox.RootElement.EnumerateArray()
            .Single(h => h.GetProperty("conversacion_id").GetInt32() == conversacionId);
        Assert.Equal(original, fila.GetProperty("ultimo_mensaje_texto").GetString());
    }

    // ---- Requirement: participant-only access, 404-not-403 (ACC1–2) --------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task ConversacionAjena_CuatroOperaciones_Responden404_SinEscribir()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        var intruso = await RegistrarUsuarioAsync();
        var clienteIntruso = AuthedClient(intruso);

        await using (var db = NewDb())
        {
            Assert.Equal(0, await db.Mensajes.CountAsync(m => m.ConversacionId == conversacionId));
        }

        var directo = await clienteIntruso.GetAsync($"/api/Chat/{conversacionId}");
        var pagina = await clienteIntruso.GetAsync($"/api/Chat/{conversacionId}/mensajes");
        var enviar = await clienteIntruso.PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "colado" }));
        var leido = await clienteIntruso.PutAsync($"/api/Chat/{conversacionId}/leido", null);

        foreach (var res in new[] { directo, pagina, enviar, leido })
        {
            Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
            var cuerpo = await res.Content.ReadAsStringAsync();
            Assert.Contains("mensaje", cuerpo);
        }

        await using var db2 = NewDb();
        Assert.Equal(0, await db2.Mensajes.CountAsync(m => m.ConversacionId == conversacionId));
        Assert.Null((await db2.Conversaciones.AsNoTracking().FirstAsync(c => c.Id == conversacionId)).UltimoLeidoViajeroEn);
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task Participante_LasCuatroOperaciones_Dan2xx()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        var cliente = AuthedClient(viajero);

        var directo = await cliente.GetAsync($"/api/Chat/{conversacionId}");
        var pagina = await cliente.GetAsync($"/api/Chat/{conversacionId}/mensajes");
        var enviar = await cliente.PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "presente" }));
        var leido = await cliente.PutAsync($"/api/Chat/{conversacionId}/leido", null);

        Assert.True((int)directo.StatusCode is >= 200 and <= 299, $"directo: {(int)directo.StatusCode}");
        Assert.True((int)pagina.StatusCode is >= 200 and <= 299, $"pagina: {(int)pagina.StatusCode}");
        Assert.Equal(HttpStatusCode.Created, enviar.StatusCode);
        Assert.True((int)leido.StatusCode is >= 200 and <= 299, $"leido: {(int)leido.StatusCode}");
    }

    // ---- Requirement: identity from the subject claim only (ACC3) ----------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task ViajeroSuplantadoEnQuery_SeIgnora_ElParSeResuelveConElSubject()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();

        var res = await AuthedClient(viajero).GetAsync(
            $"/api/Chat/anfitrion/{hostSesion.anfitrionId}?viajero_usuario_id=99");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.Equal(viajero.UserId, body.RootElement.GetProperty("viajero_usuario_id").GetInt32());
    }

    // ---- Requirement: admin has no non-participant visibility (ACC4–5, INB3) -----

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task Admin_SondaConversacionAjena_Responde404_IGUALQueUsuario()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        var admin = await ClienteAdminAsync();

        var directo = await admin.GetAsync($"/api/Chat/{conversacionId}");
        var pagina = await admin.GetAsync($"/api/Chat/{conversacionId}/mensajes");

        Assert.Equal(HttpStatusCode.NotFound, directo.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, pagina.StatusCode);
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task Admin_NoParticipante_SuBandejaEstaVacia()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        using var inbox = await LeerJsonAsync((await ClienteAdminAsync()).GetAsync("/api/Chat/mias"));
        Assert.DoesNotContain(inbox.RootElement.EnumerateArray(), h =>
            h.GetProperty("conversacion_id").GetInt32() == conversacionId);
    }

    // ---- Requirement: unauthenticated uses the existing auth surface -------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task Anonimo_TodosLosEndpoints_Responden401_SinEscribirFilas()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        await using var db = NewDb();
        var convAntes = await db.Conversaciones.CountAsync();
        var mensajesAntes = await db.Mensajes.CountAsync();

        var anon = Client();
        var aperturas = await anon.GetAsync($"/api/Chat/anfitrion/{hostSesion.anfitrionId}");
        var directo = await anon.GetAsync($"/api/Chat/{conversacionId}");
        var pagina = await anon.GetAsync($"/api/Chat/{conversacionId}/mensajes");
        var enviar = await anon.PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "anónimo" }));
        var leido = await anon.PutAsync($"/api/Chat/{conversacionId}/leido", null);
        var inbox = await anon.GetAsync("/api/Chat/mias");
        var noLeidos = await anon.GetAsync("/api/Chat/no-leidos");

        foreach (var res in new[] { aperturas, directo, pagina, enviar, leido, inbox, noLeidos })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        }

        await using var db2 = NewDb();
        Assert.Equal(convAntes, await db2.Conversaciones.CountAsync());
        Assert.Equal(mensajesAntes, await db2.Mensajes.CountAsync());
    }

    // ---- Requirement: no rate limiter in v1 (ACC spec) ---------------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task CincoEnviosSeguidos_Todos201_Ningun429()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        var cliente = AuthedClient(viajero);

        for (var i = 1; i <= 5; i++)
        {
            var res = await cliente.PostAsync(
                $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = $"Mensaje {i} cortito." }));
            Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        }
    }

    // ---- Requirement: role-filtered inbox (INB1–2) -------------------------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task ViajeroVeLaFilaDelPar_ConNombreFotoHoraDelAnfitrion()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "¿Hola?" }));

        using var inbox = await LeerJsonAsync(AuthedClient(viajero).GetAsync("/api/Chat/mias"));
        var fila = inbox.RootElement.EnumerateArray()
            .Single(h => h.GetProperty("conversacion_id").GetInt32() == conversacionId);
        Assert.Contains("Chat Host", fila.GetProperty("contra_nombre").GetString());
        Assert.Equal("https://cdn.chat.test/host.jpg", fila.GetProperty("contra_foto").GetString());
        Assert.True(fila.TryGetProperty("ultimo_mensaje_en", out _));
        Assert.Equal("¿Hola?", fila.GetProperty("ultimo_mensaje_texto").GetString());
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task AmbosRoles_VenLaMismaFila_DelHiloIntercambiado()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "pregunta" }));
        await AuthedClient(hostSesion).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "respuesta" }));

        var delViajero = await LeerRowAsync(viajero, conversacionId);
        var delHost = await LeerRowAsync(hostSesion, conversacionId);
        Assert.Equal("respuesta", delViajero.GetProperty("ultimo_mensaje_texto").GetString());
        Assert.Equal("respuesta", delHost.GetProperty("ultimo_mensaje_texto").GetString());
    }

    // ---- Requirement: unread derived from last-read stamps (INB4–6) --------------

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task DosMensajesDelHost_SinLeer_TranqueDos()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        foreach (var i in new[] { 1, 2 })
        {
            await AuthedClient(hostSesion).PostAsync(
                $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = $"Aviso {i}." }));
        }

        var total = await TotalNoLeidosAsync(viajero);
        Assert.Equal(2, total);
        var fila = await LeerRowAsync(viajero, conversacionId);
        Assert.Equal(2, fila.GetProperty("no_leidos").GetInt32());
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task MarcarLeido_AvanzaSoloAlCampoDelLlamante()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);
        await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "viaje" }));
        await AuthedClient(hostSesion).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "vuelta" }));

        var leido = await AuthedClient(viajero).PutAsync($"/api/Chat/{conversacionId}/leido", null);
        Assert.Equal(HttpStatusCode.OK, leido.StatusCode);

        await using var db = NewDb();
        var conv = await db.Conversaciones.AsNoTracking().FirstAsync(c => c.Id == conversacionId);
        Assert.NotNull(conv.UltimoLeidoViajeroEn);
        Assert.Null(conv.UltimoLeidoAnfitrionEn);
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task TresSinLeerDelViajero_AbrirYMarcar_BajaACero_SinTocarAlHost()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        await AuthedClient(viajero).PostAsync(
            $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = "uno" }));
        foreach (var i in new[] { 1, 2, 3 })
        {
            await AuthedClient(hostSesion).PostAsync(
                $"/api/Chat/{conversacionId}/mensajes", Json(new { mensaje = $"Tres sin leer {i}." }));
        }

        Assert.Equal(3, await TotalNoLeidosAsync(viajero));

        // Opening the conversation (page fetch) is the read trigger; the
        // endpoint itself must move the caller's badge to zero.
        await AuthedClient(viajero).GetAsync($"/api/Chat/{conversacionId}/mensajes");
        await AuthedClient(viajero).PutAsync($"/api/Chat/{conversacionId}/leido", null);

        Assert.Equal(0, await TotalNoLeidosAsync(viajero));
        Assert.Equal(1, await TotalNoLeidosAsync(hostSesion));
    }

    [SkippableFact]
    [Trait("Category", "Chat")]
    public async Task ConversacionVacia_MarcarLeido_NoOp_200()
    {
        var (viajero, hostSesion, _, _) = await CrearParConConversacionAsync();
        var conversacionId = await AbrirConversacionIdAsync(viajero, hostSesion.anfitrionId);

        var res = await AuthedClient(viajero).PutAsync($"/api/Chat/{conversacionId}/leido", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        await using var db = NewDb();
        var conv = await db.Conversaciones.AsNoTracking().FirstAsync(c => c.Id == conversacionId);
        Assert.Null(conv.UltimoLeidoViajeroEn);
        Assert.Null(conv.UltimoLeidoAnfitrionEn);
    }

    // ---- Helpers ------------------------------------------------------------------

    private sealed record Session(int UserId, string Email, string Auth, string Csrf);

    private sealed record HostFixture(int anfitrionId, Session Sesion)
    {
        public int UsuarioId => Sesion.UserId;
        public int UserId => Sesion.UserId;
    }

    private HttpClient Client() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false,
        });

    private HttpClient AuthedClient(Session session) => AuthedClient(_factory, session);

    private HttpClient AuthedClient(HostFixture host) => AuthedClient(host.Sesion);

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

    /// <summary>
    /// A minted admin principal: sub 0 has no usuario row, so it is never a
    /// traveler, and no host row links to it — the pure non-participant admin.
    /// </summary>
    private async Task<HttpClient> ClienteAdminAsync()
    {
        var token = MintToken("0", "admin");
        var csrf = NewCsrf();
        return AuthedClient(new Session(0, "admin@chat.test", token, csrf));
    }

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

    private static string NewEmail() => $"u{Guid.NewGuid():N}@chat.test".ToLowerInvariant();

    private async Task<Session> RegistrarUsuarioAsync()
    {
        var email = NewEmail();
        var res = await Client().PostAsync("/api/Auth/register", Json(new
        {
            nombre = "Chat",
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

    private IguanasDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql(_fixture.ConnectionString!)
            .Options;
        return new IguanasDbContext(options);
    }

    private int LeerId(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        return doc.RootElement.GetProperty("id").GetInt32();
    }

    private static async Task<JsonDocument> LeerJsonAsync(Task<HttpResponseMessage> pending)
    {
        var res = await pending;
        res.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync());
    }

    /// <summary>Seeds a host row linked to the registered session's usuario.</summary>
    private async Task<HostFixture> SembrarHostDe(Session usuario)
    {
        var anfitrionId = await SembrarAnfitrionAsync(usuario.UserId);
        return new HostFixture(anfitrionId, usuario);
    }

    private async Task<int> SembrarAnfitrionAsync(int? usuarioId)
    {
        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var departamento = new Departamento { Nombre = $"CDep {tag}" };
        var municipio = new Municipio { Nombre = $"CMun {tag}", Departamento = departamento };
        db.Departamentos.Add(departamento);
        db.Municipios.Add(municipio);
        await db.SaveChangesAsync();

        var host = new Anfitrione
        {
            UsuarioId = usuarioId,
            MunicipioId = municipio.Id,
            Nombre = $"Chat Host {tag}",
            Email = $"host{tag}@chat.test".ToLowerInvariant(),
            FotoPerfil = "https://cdn.chat.test/host.jpg",
            Verificado = false,
        };
        db.Anfitriones.Add(host);
        await db.SaveChangesAsync();
        return host.Id;
    }

    /// <summary>A host row with a NULL usuario_id — the fail-closed probe.</summary>
    private async Task<int> SembrarHostSinVinculoAsync() => await SembrarAnfitrionAsync(null);

    /// <summary>
    /// One traveler + one linked host (with a publication) ready to open a pair.
    /// Returns (viajero, host, publicacionId, titulo).
    /// </summary>
    private async Task<(Session Viajero, HostFixture Host, int PublicacionId, string Titulo)> CrearParConConversacionAsync()
    {
        var viajero = await RegistrarUsuarioAsync();
        var hostSesion = await RegistrarUsuarioAsync();
        var anfitrionId = await SembrarAnfitrionAsync(hostSesion.UserId);

        await using var db = NewDb();
        var tag = Guid.NewGuid().ToString("N");
        var categoria = new Categoria { Nombre = $"CCat {tag}", Tipo = "experiencia" };
        db.Categorias.Add(categoria);
        await db.SaveChangesAsync();
        var titulo = $"Ruta del café {tag}";
        var publicacion = new Publicacione
        {
            AnfitrionId = anfitrionId,
            CategoriaId = categoria.Id,
            Tipo = "experiencia",
            Titulo = titulo,
            Descripcion = "Seeded by the Chat slice.",
            PrecioPorNoche = 50m,
            CapacidadMaxima = 8,
            Estado = "activo",
        };
        db.Publicaciones.Add(publicacion);
        await db.SaveChangesAsync();

        return (viajero, new HostFixture(anfitrionId, hostSesion), publicacion.Id, titulo);
    }

    private async Task<int> AbrirConversacionIdAsync(Session viajero, int anfitrionId)
    {
        var res = await AuthedClient(viajero).GetAsync($"/api/Chat/anfitrion/{anfitrionId}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return LeerId(res);
    }

    /// <summary>
    /// Seeds <paramref name="cantidad"/> messages with distinct, ordered stamps
    /// (the DB clock inside one SaveChanges is transaction-stable, so the
    /// keyset fixture controls created times explicitly).
    /// </summary>
    private async Task<List<int>> SembrarMensajesAsync(int conversacionId, int emisorUsuarioId, int cantidad)
    {
        var baseTime = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await using var db = NewDb();
        for (var i = 1; i <= cantidad; i++)
        {
            db.Mensajes.Add(new Mensaje
            {
                ConversacionId = conversacionId,
                EmisorUsuarioId = emisorUsuarioId,
                Texto = $"Mensaje sembrado {i}.",
                CreadoEn = baseTime.AddMinutes(i),
            });
        }
        await db.SaveChangesAsync();
        return await db.Mensajes
            .Where(m => m.ConversacionId == conversacionId)
            .Select(m => m.Id)
            .ToListAsync();
    }

    private async Task<int> TotalNoLeidosAsync(Session sesion)
    {
        using var doc = await LeerJsonAsync(AuthedClient(sesion).GetAsync("/api/Chat/no-leidos"));
        return doc.RootElement.GetProperty("total").GetInt32();
    }

    private Task<int> TotalNoLeidosAsync(HostFixture host) => TotalNoLeidosAsync(host.Sesion);

    private async Task<JsonElement> LeerRowAsync(Session sesion, int conversacionId)
    {
        using var inbox = await LeerJsonAsync(AuthedClient(sesion).GetAsync("/api/Chat/mias"));
        return Assert.Single(inbox.RootElement.EnumerateArray(), h =>
            h.GetProperty("conversacion_id").GetInt32() == conversacionId).Clone();
    }

    private Task<JsonElement> LeerRowAsync(HostFixture host, int conversacionId) =>
        LeerRowAsync(host.Sesion, conversacionId);
}
