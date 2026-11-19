namespace IguanaSV.Api.Models;

// Public, PII-free view of a publication handed to the model. Add a field only
// if it is already public on the catalog page: GET /api/Publicacione embeds the
// full host row (email, phone), and that response must never reach an LLM.
public sealed record CatalogoAsistenteItem(
    int Id,
    string Tipo,
    string Titulo,
    string? Descripcion,
    string Categoria,
    string Municipio,
    string Departamento,
    decimal Precio,
    int CapacidadMaxima);

// One previous exchange, echoed back by the client so the model can follow the
// thread. `Rol` is whitelisted server-side: only usuario/asistente are accepted.
public sealed record AsistenteTurno(string? Rol, string? Texto);

public sealed record AsistenteChatRequest(
    string? Mensaje,
    string? ContentLocale,
    IReadOnlyList<AsistenteTurno>? Historial);

// Publications the answer actually mentions, resolved server-side by title so
// the client can link them without trusting the model to emit ids.
public sealed record AsistentePublicacion(int Id, string Titulo);
