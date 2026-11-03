using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Reporte
{
    public int Id { get; set; }

    public int ReservaId { get; set; }

    public int PublicacionId { get; set; }

    public int AnfitrionId { get; set; }

    public int UsuarioHuespedId { get; set; }

    public string Tipo { get; set; } = null!;

    public string Descripcion { get; set; } = null!;

    public string Estado { get; set; } = "pendiente";

    public DateTime CreadoEn { get; set; }

    public int? ResueltoPorAdminId { get; set; }

    public DateTime? ResueltoEn { get; set; }

    public string? NotasAdmin { get; set; }

    public virtual Reserva Reserva { get; set; } = null!;

    public virtual Publicacione Publicacion { get; set; } = null!;

    public virtual Anfitrione Anfitrion { get; set; } = null!;

    public virtual Usuario UsuarioHuesped { get; set; } = null!;

    public virtual Usuario? ResueltoPorAdmin { get; set; }

    public virtual ICollection<ReporteEvidencia> Evidencias { get; set; } = new List<ReporteEvidencia>();
}
