using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

/// <summary>
/// One persistent traveler↔host conversation per (viajero_usuario_id, anfitrion_id)
/// pair — the unique index is the contract. The traveler side is the subject of the
/// authenticated request; the host side is always resolved server-side through
/// <c>anfitriones.usuario_id</c>, never from a client-supplied user id.
/// Inbox previews (<see cref="UltimoMensajeEn"/>/<see cref="UltimoMensajeTexto"/>) are
/// denormalized with every message in the same SaveChanges; unread state is never
/// stored — it is derived from the per-side last-read timestamps.
/// </summary>
public partial class Conversacione
{
    public int Id { get; set; }

    public int ViajeroUsuarioId { get; set; }

    public int AnfitrionId { get; set; }

    /// <summary>Preview timestamp of the newest message (inbox ordering).</summary>
    public DateTime? UltimoMensajeEn { get; set; }

    /// <summary>Preview text of the newest message.</summary>
    public string? UltimoMensajeTexto { get; set; }

    /// <summary>Newest traveler-visible moment; null means "never read".</summary>
    public DateTime? UltimoLeidoViajeroEn { get; set; }

    /// <summary>Newest host-visible moment; null means "never read".</summary>
    public DateTime? UltimoLeidoAnfitrionEn { get; set; }

    public DateTime CreadoEn { get; set; }

    public virtual Anfitrione Anfitrion { get; set; } = null!;

    public virtual Usuario ViajeroUsuario { get; set; } = null!;

    public virtual ICollection<Mensaje> Mensajes { get; set; } = new List<Mensaje>();
}
