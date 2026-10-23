namespace IguanaSV.Api.Models;

/// <summary>
/// Guest-submittable review payload for POST <c>/api/Resena</c>. The server
/// derives PublicacionId/UsuarioId from the reservation row and re-validates
/// the eligibility rules (owner, arrival day reached, confirmed/completed,
/// not yet reviewed), so neither of those keys appears here.
/// </summary>
public class CrearResenaDto
{
    public int ReservaId { get; set; }

    /// <summary>0 to 5 stars (enforced by CrearResenaValidator).</summary>
    public short Calificacion { get; set; }

    /// <summary>Optional free text, max 500 characters.</summary>
    public string? Comentario { get; set; }
}

/// <summary>
/// Host-submittable review payload for POST <c>/api/Resena/huesped</c>.
/// Allows a host to rate a guest after a completed reservation.
/// The server validates the host owns the publication and the reservation is completed.
/// </summary>
public class CrearResenaHuespedDto
{
    public int ReservaId { get; set; }

    /// <summary>0 to 5 stars (enforced by validator).</summary>
    public short Calificacion { get; set; }

    /// <summary>Optional free text, max 500 characters.</summary>
    public string? Comentario { get; set; }
}

/// <summary>
/// Host reply payload for PUT <c>/api/Resena/{id}/respuesta</c>. A null or
/// empty string clears the existing reply; the server stamps the timestamp.
/// </summary>
public class ResponderResenaDto
{
    public string? Respuesta { get; set; }
}

/// <summary>
/// Star average + review count for a publication (or a batch of them, or a
/// host's global rating, or a user's rating). Zero values mean "no reviews yet".
/// </summary>
public class ResumenResenasDto
{
    public double Promedio { get; set; }

    public int Total { get; set; }
}
