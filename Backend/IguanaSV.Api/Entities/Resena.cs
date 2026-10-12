using System;

namespace IguanaSV.Api.Entities;

/// <summary>
/// A guest's rating for a reservation, allowed only once the stay/experience has
/// started (arrival day) for a confirmed (or already completed) reservation.
/// One row per reservation (unique reserva_id) keeps the publication average
/// free of duplicate votes from the same booking. The host may post a single
/// public reply (<see cref="RespuestaAnfitrion"/>).
/// </summary>
public partial class Resena
{
    public int Id { get; set; }

    public int ReservaId { get; set; }

    public int PublicacionId { get; set; }

    public int UsuarioId { get; set; }

    /// <summary>0 to 5 stars, inclusive.</summary>
    public short Calificacion { get; set; }

    /// <summary>Optional free-text comment, max 500 chars (validated by the DTO).</summary>
    public string? Comentario { get; set; }

    /// <summary>Public host reply; single reply, edited in place.</summary>
    public string? RespuestaAnfitrion { get; set; }

    public DateTime? FechaRespuesta { get; set; }

    public DateTime CreadoEn { get; set; }

    public DateTime? ActualizadoEn { get; set; }

    public virtual Publicacione Publicacion { get; set; } = null!;

    public virtual Reserva Reserva { get; set; } = null!;

    public virtual Usuario Usuario { get; set; } = null!;
}
