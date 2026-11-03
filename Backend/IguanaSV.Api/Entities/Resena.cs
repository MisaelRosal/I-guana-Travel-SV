using System;
using System.Text.Json.Serialization;

namespace IguanaSV.Api.Entities;

/// <summary>
/// A rating for a reservation. Can be:
/// - Guest → Host (public, tied to publication) — existing flow
/// - Host → Guest (private, not tied to publication) — new flow for user reputation
/// One row per reservation (unique reserva_id) keeps reviews free of duplicates.
/// </summary>
public partial class Resena
{
    public int Id { get; set; }

    public int ReservaId { get; set; }

    public int PublicacionId { get; set; }

    /// <summary>The user who wrote the review (guest for guest→host, host for host→guest).</summary>
    public int UsuarioId { get; set; }

    /// <summary>The user being reviewed. Null for legacy guest→host reviews; set for host→guest.</summary>
    public int? UsuarioDestinoId { get; set; }

    /// <summary>0 to 5 stars, inclusive.</summary>
    public short Calificacion { get; set; }

    /// <summary>Optional free-text comment, max 500 chars (validated by the DTO).</summary>
    public string? Comentario { get; set; }

    [JsonIgnore]
    public string? ComentarioEn { get; set; }

    /// <summary>Public host reply; single reply, edited in place (only for guest→host reviews).</summary>
    public string? RespuestaAnfitrion { get; set; }

    [JsonIgnore]
    public string? RespuestaAnfitrionEn { get; set; }

    public DateTime? FechaRespuesta { get; set; }

    public DateTime CreadoEn { get; set; }

    public DateTime? ActualizadoEn { get; set; }

    public virtual Publicacione Publicacion { get; set; } = null!;

    public virtual Reserva Reserva { get; set; } = null!;

    public virtual Usuario Usuario { get; set; } = null!;

    /// <summary>Target user for host→guest reviews.</summary>
    public virtual Usuario? UsuarioDestino { get; set; }
}
