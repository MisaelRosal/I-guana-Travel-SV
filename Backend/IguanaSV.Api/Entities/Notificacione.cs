using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Notificacione
{
    public int Id { get; set; }

    public int? ReservaId { get; set; }

    public int? UsuarioId { get; set; }

    public string Tipo { get; set; } = null!;

    public string Mensaje { get; set; } = null!;

    public bool? Leida { get; set; }

    public string DestinatarioEmail { get; set; } = null!;

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual Reserva? Reserva { get; set; }

    public virtual Usuario? Usuario { get; set; }
}
