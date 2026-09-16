namespace IguanaSV.Api.Models;

public class CreateReservaDto
{
    public int PublicacionId { get; set; }
    public string NombreHuesped { get; set; } = string.Empty;
    public string EmailHuesped { get; set; } = string.Empty;
    public string? TelefonoHuesped { get; set; }
    public DateOnly FechaInicio { get; set; }
    public DateOnly FechaFin { get; set; }
    public int NumeroHuespedes { get; set; }
    public decimal PrecioTotal { get; set; }
}
