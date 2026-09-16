using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Horario
{
    public int Id { get; set; }

    public int PublicacionId { get; set; }

    public int? DiaSemana { get; set; }

    public DateOnly? Fecha { get; set; }

    public TimeOnly HoraInicio { get; set; }

    public TimeOnly HoraFin { get; set; }

    public bool? Disponible { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual Publicacione? Publicacion { get; set; }

    public virtual ICollection<ReservaHorario> ReservaHorarios { get; set; } = new List<ReservaHorario>();
}
