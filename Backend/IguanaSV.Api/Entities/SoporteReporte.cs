using System;

namespace IguanaSV.Api.Entities;

public partial class SoporteReporte
{
    public int Id { get; set; }

    public int? UsuarioId { get; set; }

    public string Nombre { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string Asunto { get; set; } = null!;

    public string Mensaje { get; set; } = null!;

    public string Estado { get; set; } = "pendiente";

    public DateTime CreadoEn { get; set; }

    public DateTime? ActualizadoEn { get; set; }

    public string? NotasAdmin { get; set; }

    public int? ResueltoPorAdminId { get; set; }

    public DateTime? ResueltoEn { get; set; }

    public virtual Usuario? Usuario { get; set; }

    public virtual Usuario? ResueltoPorAdmin { get; set; }
}
