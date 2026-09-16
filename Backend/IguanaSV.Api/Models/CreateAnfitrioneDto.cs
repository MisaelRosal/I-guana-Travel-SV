namespace IguanaSV.Api.Models;

public class CreateAnfitrioneDto
{
    public int MunicipioId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Telefono { get; set; }
    public string? Direccion { get; set; }
}
