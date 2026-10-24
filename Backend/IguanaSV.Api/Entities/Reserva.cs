using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Reserva
{
    public int Id { get; set; }

    public int PublicacionId { get; set; }

    public int? UsuarioId { get; set; }

    public string NombreHuesped { get; set; } = null!;

    public string EmailHuesped { get; set; } = null!;

    public string? TelefonoHuesped { get; set; }

    public DateOnly FechaInicio { get; set; }

    public DateOnly FechaFin { get; set; }

    public int NumeroHuespedes { get; set; }

    public decimal PrecioTotal { get; set; }

    public string? Estado { get; set; }

    public string? MetodoPago { get; set; }

    public DateTime? FechaPago { get; set; }

    // One-hour grace window for short (<24h) reservations: while it has not
    // expired and the reservation is still "pendiente", edit/cancel/pay stay
    // allowed even though check-in is today or tomorrow. NULL for normal
    // reservations, which keep the legacy "1 day or less" blocking rules.
    public DateTime? FechaExpiracionGracia { get; set; }

    public string? IdTransaccion { get; set; }

    // Set once the "you can now review" email has been sent for this stay, so
    // the availability job never notifies the same reservation twice.
    public DateTime? ResenasNotificadasEn { get; set; }

    // Set when the host reprogrammed the experience date and this reservation
    // was moved with it. It lifts the normal cancel windows (paid/grace/date)
    // so the guest can always decline the new date without restriction.
    public bool CancelacionLibre { get; set; }

    // Audit of the last host-driven reschedule: the date the reservation was
    // moved away from and when the move happened.
    public DateOnly? ReprogramadaDesde { get; set; }

    public DateTime? ReprogramadaEn { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual ICollection<Notificacione> Notificaciones { get; set; } = new List<Notificacione>();

    public virtual Publicacione? Publicacion { get; set; }

    public virtual Resena? Resena { get; set; }

    public virtual Usuario? Usuario { get; set; }

    public virtual ICollection<ReservaHorario> ReservaHorarios { get; set; } = new List<ReservaHorario>();
}
