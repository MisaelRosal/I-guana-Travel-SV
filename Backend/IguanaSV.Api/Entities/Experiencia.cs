using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace IguanaSV.Api.Entities;

public partial class Experiencia
{
    public int Id { get; set; }

    public int PublicacionId { get; set; }

    public string Nombre { get; set; } = null!;

    [JsonIgnore]
    public string? NombreEn { get; set; }

    public string? Descripcion { get; set; }

    [JsonIgnore]
    public string? DescripcionEn { get; set; }

    public int? DuracionHoras { get; set; }

    public decimal? PrecioAdicional { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual Publicacione? Publicacion { get; set; }
}
