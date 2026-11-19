using System;

namespace IguanaSV.Api.Entities;

/// <summary>
/// Append-only audit trail for every outbound email the platform attempts.
/// Delivery is fire-and-forget from the caller's perspective (a failed email
/// must never fail the registration/publication/reservation that triggered it),
/// so this row is what makes a missing notification diagnosable after the fact.
/// </summary>
public partial class NotificacionEmail
{
    public int Id { get; set; }

    public int? UsuarioId { get; set; }

    public string Destinatario { get; set; } = null!;

    public string Asunto { get; set; } = null!;

    public string Tipo { get; set; } = null!;

    /// <summary>pendiente | enviado | error</summary>
    public string Estado { get; set; } = "pendiente";

    public string? MensajeError { get; set; }

    public DateTime CreadoEn { get; set; }

    public virtual Usuario? Usuario { get; set; }
}
