using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Anfitrione
{
    public int Id { get; set; }

    public int MunicipioId { get; set; }

    public int? UsuarioId { get; set; }

    public string Nombre { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string? Telefono { get; set; }

    public string? Direccion { get; set; }

    public string? Descripcion { get; set; }

    public string? FotoPerfil { get; set; }

    public bool? Verificado { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual Municipio? Municipio { get; set; }

    public virtual Usuario? Usuario { get; set; }

    public virtual ICollection<Publicacione> Publicaciones { get; set; } = new List<Publicacione>();
}
