using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Publicacione
{
    public int Id { get; set; }

    public int AnfitrionId { get; set; }

    public int CategoriaId { get; set; }

    public string Tipo { get; set; } = null!;

    public string Titulo { get; set; } = null!;

    public string? Descripcion { get; set; }

    public decimal PrecioPorNoche { get; set; }

    public int CapacidadMaxima { get; set; }

    public int? Habitaciones { get; set; }

    public int? Camas { get; set; }

    public int? Banos { get; set; }

    public string? DireccionExacta { get; set; }

    public decimal? Latitud { get; set; }

    public decimal? Longitud { get; set; }

    public int? MunicipioId { get; set; }

    public string? Estado { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual Anfitrione? Anfitrion { get; set; }

    public virtual Categoria? Categoria { get; set; }

    public virtual Municipio? Municipio { get; set; }

    public virtual ICollection<Experiencia> Experiencia { get; set; } = new List<Experiencia>();

    public virtual ICollection<Horario> Horarios { get; set; } = new List<Horario>();

    public virtual ICollection<ImagenesPublicacion> ImagenesPublicacions { get; set; } = new List<ImagenesPublicacion>();

    public virtual ICollection<PublicacionAmenidad> PublicacionAmenidads { get; set; } = new List<PublicacionAmenidad>();

    public virtual ICollection<Reserva> Reservas { get; set; } = new List<Reserva>();
}
