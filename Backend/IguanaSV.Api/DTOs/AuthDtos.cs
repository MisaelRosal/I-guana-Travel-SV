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
    public bool EmailVerificado { get; set; }
    public DateTime? CreatedAt { get; set; }
}

/// <summary>
/// What POST /api/auth/register returns. The account is created but NOT
/// authenticated when <see cref="VerificacionRequerida"/> is true: the caller
/// must hand back the emailed code through
/// POST /api/auth/verificar-email before a session is issued.
/// </summary>
public class RegistroResponseDto
{
    public int Id { get; set; }
    public string Email { get; set; } = null!;
    public bool VerificacionRequerida { get; set; }
    public string Mensaje { get; set; } = null!;
}

public class VerificarEmailRequest
{
    public string Email { get; set; } = null!;
    public string Codigo { get; set; } = null!;
}

public class ReenviarVerificacionRequest
{
    public string Email { get; set; } = null!;
}

public class ActualizarPerfilAnfitrionRequest
{
    public string? Descripcion { get; set; }
}

/// <summary>
/// Self-registration payload for the host profile. W3b removed <c>UsuarioId</c>:
/// the created host is always bound to the authenticated token's <c>sub</c>,
/// closing the mass-assignment where a caller could promote an arbitrary user
/// (spec authz-roles-ownership: "Registrar binds identity from the token").
/// </summary>
public class RegistroAnfitrionRequest
{
    public int MunicipioId { get; set; }
    public string Nombre { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? Telefono { get; set; }
    public string? Direccion { get; set; }
    public string? Descripcion { get; set; }
    public string? FotoPerfil { get; set; }
}

/// <summary>
/// Partial self-update sent by a host from "Mi perfil"
/// (PUT /api/Anfitrione/mi-perfil). A null field means "keep current value".
/// <see cref="Email"/> is the anfitriones.email CONTACT address only — the
/// login credential (usuarios.email) is a different column and is never
/// touched here. There is deliberately no Verificado/UsuarioId field: profile
/// editing must not self-verify a host nor re-link the row to another user
/// (same discipline as the guards in AnfitrioneController).
/// </summary>
public class EditarPerfilAnfitrionDto
{
    public string? Email { get; set; }
    public string? Telefono { get; set; }
    public int? MunicipioId { get; set; }
    public string? Descripcion { get; set; }
}

/// <summary>
/// Full OWN host profile returned by GET/PUT /api/Anfitrione/mi-perfil. The
/// nested municipio/departamento shape mirrors the entity JSON so the SPA's
/// departamento→municipio cascade can preselect both selects from ids alone.
/// </summary>
public class MiPerfilAnfitrionDto
{
    public int Id { get; set; }
    public string Nombre { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? Telefono { get; set; }
    public string? Direccion { get; set; }
    public string? Descripcion { get; set; }
    public string? FotoPerfil { get; set; }
    public bool? Verificado { get; set; }
    public int MunicipioId { get; set; }
    public AnfitrionMunicipioDto? Municipio { get; set; }
    public int PublicacionesCount { get; set; }
}

/// <summary>
/// Projection of the host LIST for anonymous/usuario callers. Contact PII
/// (Email/Telefono) and the internal UsuarioId link are excluded: GET
/// /api/Anfitrione must no longer bulk-expose every host's contact data.
/// Admins keep the full rows; a host reads their own full row through
/// GET mi-perfil, never through this list.
/// </summary>
public class AnfitrionCatalogoDto
{
    public int Id { get; set; }
    public string Nombre { get; set; } = null!;
    public string? Descripcion { get; set; }
    public string? Direccion { get; set; }
    public string? FotoPerfil { get; set; }
    public bool? Verificado { get; set; }
    public int MunicipioId { get; set; }
    public AnfitrionMunicipioDto? Municipio { get; set; }
}

/// <summary>
/// Projection of a SINGLE host for callers that are neither admin nor owner.
/// Email/Telefono stay — the public profile page shows them by product
/// decision — but the internal UsuarioId link is stripped.
/// </summary>
public class AnfitrionPublicoDto
{
    public int Id { get; set; }
    public string Nombre { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string? Telefono { get; set; }
    public string? Descripcion { get; set; }
    public string? Direccion { get; set; }
    public string? FotoPerfil { get; set; }
    public bool? Verificado { get; set; }
    public int MunicipioId { get; set; }
    public AnfitrionMunicipioDto? Municipio { get; set; }
}

public class AnfitrionMunicipioDto
{
    public int Id { get; set; }
    public string Nombre { get; set; } = null!;
    public int DepartamentoId { get; set; }
    public AnfitrionDepartamentoDto? Departamento { get; set; }
}

public class AnfitrionDepartamentoDto
{
    public int Id { get; set; }
    public string Nombre { get; set; } = null!;
}
