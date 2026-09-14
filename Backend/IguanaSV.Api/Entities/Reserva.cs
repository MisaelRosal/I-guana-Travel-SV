using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Reserva
{
    public int Id { get; set; }

    public int PublicacionId { get; set; }

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

    public string? IdTransaccion { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual ICollection<Notificacione> Notificaciones { get; set; } = new List<Notificacione>();

    public virtual Publicacione? Publicacion { get; set; }

    public virtual ICollection<ReservaHorario> ReservaHorarios { get; set; } = new List<ReservaHorario>();
}
