using System;
using System.Collections.Generic;

namespace IguanaSV.Api.Entities;

public partial class Usuario
{
    public int Id { get; set; }

    public string Nombre { get; set; } = null!;

    public string Apellido { get; set; } = null!;

    public string? Telefono { get; set; }

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string Rol { get; set; } = "usuario";

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}
