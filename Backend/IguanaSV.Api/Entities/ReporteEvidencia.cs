using System;

namespace IguanaSV.Api.Entities;

public partial class ReporteEvidencia
{
    public int Id { get; set; }

    public int ReporteId { get; set; }

    public string Url { get; set; } = null!;

    public string? NombreArchivo { get; set; }

    public string? ContentType { get; set; }

    public DateTime CreadoEn { get; set; }

    public virtual Reporte Reporte { get; set; } = null!;
}
