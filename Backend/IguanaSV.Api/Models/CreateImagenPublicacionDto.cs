namespace IguanaSV.Api.Models;

public class CreateImagenPublicacionDto
{
    public int PublicacionId { get; set; }
    public string Url { get; set; } = string.Empty;
    public bool? EsPrincipal { get; set; }
    public int? Orden { get; set; }
}
