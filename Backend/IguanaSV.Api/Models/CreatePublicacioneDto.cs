namespace IguanaSV.Api.Models;

public class CreatePublicacioneDto
{
    public int AnfitrionId { get; set; }
    public int CategoriaId { get; set; }
    public string Titulo { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public decimal PrecioPorNoche { get; set; }
    public int CapacidadMaxima { get; set; }
    public int? Habitaciones { get; set; }
    public int? Camas { get; set; }
    public int? Banos { get; set; }
    public string? DireccionExacta { get; set; }
    public decimal? Latitud { get; set; }
    public decimal? Longitud { get; set; }
}
