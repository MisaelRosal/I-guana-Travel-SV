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

    /// <summary>
    /// False until the owner proves control of <see cref="Email"/> by entering
    /// the 6-digit code sent to it. Login is refused while this is false, so a
    /// forged address can never complete registration.
    /// </summary>
    public bool EmailVerificado { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}
