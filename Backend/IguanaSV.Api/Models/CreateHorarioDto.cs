namespace IguanaSV.Api.Models;

public class CreateHorarioDto
{
    public int PublicacionId { get; set; }
    public int? DiaSemana { get; set; }
    public DateOnly? Fecha { get; set; }
    public TimeOnly HoraInicio { get; set; }
    public TimeOnly HoraFin { get; set; }
    public bool? Disponible { get; set; }
    public int? Cupos { get; set; }
}
