namespace IguanaSV.Api.Models;

/// <summary>
/// Client-submittable reservation payload for POST/PUT <c>/api/Reserva</c>.
/// Intentionally narrow (mass-assignment defense): it carries only what a
/// guest may provide. The server owns <c>PrecioTotal</c> (recomputed from the
/// publication), <c>UsuarioId</c> (derived from the token subject), <c>Estado</c>
/// (lifecycle transitions), and the payment fields, so none of those appear
/// here and any such keys in the request body are ignored by the model binder.
/// </summary>
public class CreateReservaDto
{
    public int PublicacionId { get; set; }
    public string NombreHuesped { get; set; } = string.Empty;
    public string EmailHuesped { get; set; } = string.Empty;
    public string? TelefonoHuesped { get; set; }
    public DateOnly FechaInicio { get; set; }
    public DateOnly FechaFin { get; set; }
    public int NumeroHuespedes { get; set; }
}
