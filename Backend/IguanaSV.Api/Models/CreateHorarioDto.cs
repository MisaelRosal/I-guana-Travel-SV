namespace IguanaSV.Api.Models;

public class CreateHorarioDto
{
    public int PublicacionId { get; set; }
    public int DiaSemana { get; set; }
    public TimeOnly HoraInicio { get; set; }
    public TimeOnly HoraFin { get; set; }
}
