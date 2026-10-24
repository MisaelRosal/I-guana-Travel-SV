using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace IguanaSV.Api.Models;

/// <summary>
/// Chat wire contracts. The global serializer stays camelCase; every chat DTO
/// opts into snake_case field names via <see cref="JsonPropertyNameAttribute"/>
/// (spec: traveler-host-messaging pins `viajero_usuario_id`, `publicacion_id`,
/// the `before_creado_en`/`before_id` cursor keys and the inbox row fields).
/// </summary>

/// <summary>Pair conversation returned by open-or-get and by the direct fetch.</summary>
public class ConversacionDto
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("viajero_usuario_id")]
    public int ViajeroUsuarioId { get; set; }

    [JsonPropertyName("anfitrion_id")]
    public int AnfitrionId { get; set; }

    [JsonPropertyName("creado_en")]
    public DateTime CreadoEn { get; set; }
}

/// <summary>
/// Message payload for POST <c>/api/Chat/{id}/mensajes</c>. The sender is always
/// the token subject, never the body; <c>publicacion_id</c> is optional context
/// stored verbatim (bound from <c>experiencia.publicacionId</c> on the frontend).
/// </summary>
public class CrearMensajeDto
{
    [JsonPropertyName("mensaje")]
    public string? Mensaje { get; set; }

    [JsonPropertyName("publicacion_id")]
    public int? PublicacionId { get; set; }
}

/// <summary>Publication card attached to a message item (null when no context).</summary>
public class PublicacionContextoDto
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("titulo")]
    public string Titulo { get; set; } = string.Empty;

    [JsonPropertyName("precio")]
    public decimal Precio { get; set; }
}

/// <summary>
/// One stored message plus its read-time projections. Sender name/photo are
/// JOINed at read (no snapshot); the publication card follows the existing
/// <c>titulo_en</c> locale rule. Content is the original text, untranslated.
/// </summary>
public class MensajeItemDto
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("conversacion_id")]
    public int ConversacionId { get; set; }

    [JsonPropertyName("emisor_usuario_id")]
    public int EmisorUsuarioId { get; set; }

    [JsonPropertyName("mensaje")]
    public string Mensaje { get; set; } = string.Empty;

    [JsonPropertyName("publicacion_id")]
    public int? PublicacionId { get; set; }

    [JsonPropertyName("creado_en")]
    public DateTime CreadoEn { get; set; }

    [JsonPropertyName("emisor_nombre")]
    public string? EmisorNombre { get; set; }

    [JsonPropertyName("emisor_foto")]
    public string? EmisorFoto { get; set; }

    [JsonPropertyName("publicacion")]
    public PublicacionContextoDto? Publicacion { get; set; }
}

/// <summary>
/// Keyset page envelope: newest-first messages (max 50, fixed server-side) plus
/// the cursor to request older ones, or null when the page is not full.
/// </summary>
public class PaginaMensajesDto
{
    [JsonPropertyName("mensajes")]
    public List<MensajeItemDto> Mensajes { get; set; } = [];

    [JsonPropertyName("cursor")]
    public CursorKeysetDto? Cursor { get; set; }
}

/// <summary>
/// "Everything strictly older than this row" cursor. The field names echo the
/// query parameters so the client can resend them verbatim.
/// </summary>
public class CursorKeysetDto
{
    [JsonPropertyName("before_creado_en")]
    public DateTime AntesDe { get; set; }

    [JsonPropertyName("before_id")]
    public int AntesDeId { get; set; }
}

/// <summary>
/// One inbox row (GET <c>/api/Chat/mias</c>): the other participant's name and
/// photo, the stored last-message preview and the unread count derived from the
/// caller's own last-read timestamp.
/// </summary>
public class HiloChatDto
{
    [JsonPropertyName("conversacion_id")]
    public int ConversacionId { get; set; }

    [JsonPropertyName("contra_nombre")]
    public string? ContraNombre { get; set; }

    [JsonPropertyName("contra_foto")]
    public string? ContraFoto { get; set; }

    [JsonPropertyName("ultimo_mensaje_texto")]
    public string? UltimoMensajeTexto { get; set; }

    [JsonPropertyName("ultimo_mensaje_en")]
    public DateTime? UltimoMensajeEn { get; set; }

    [JsonPropertyName("no_leidos")]
    public int NoLeidos { get; set; }
}
