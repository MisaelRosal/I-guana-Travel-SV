namespace IguanaSV.Api.Models;

public class CreateNotificacioneDto
{
    public int ReservaId { get; set; }
    public string Tipo { get; set; } = string.Empty;
    public string Mensaje { get; set; } = string.Empty;
    public string DestinatarioEmail { get; set; } = string.Empty;
}
