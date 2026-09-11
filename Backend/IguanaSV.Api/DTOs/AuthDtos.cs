namespace IguanaSV.Api.DTOs;

public class RegistroRequest
{
    public string Nombre { get; set; } = null!;
    public string Apellido { get; set; } = null!;
    public string? Telefono { get; set; }
    public string Email { get; set; } = null!;
    public string Password { get; set; } = null!;
}

public class LoginRequest
{
    public string Email { get; set; } = null!;
    public string Password { get; set; } = null!;
}

public class UsuarioResponse
{
    public int Id { get; set; }
    public string Nombre { get; set; } = null!;
    public string Apellido { get; set; } = null!;
    public string? Telefono { get; set; }
    public string Email { get; set; } = null!;
    public string Rol { get; set; } = "usuario";
    public DateTime? CreatedAt { get; set; }
}

public class ActualizarPerfilAnfitrionRequest
{
    public string? Descripcion { get; set; }
}

public class RegistroAnfitrionRequest
{
    public int UsuarioId { get; set; }
    public int MunicipioId { get; set; }
    public string Nombre { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? Telefono { get; set; }
    public string? Direccion { get; set; }
    public string? Descripcion { get; set; }
    public string? FotoPerfil { get; set; }
}
