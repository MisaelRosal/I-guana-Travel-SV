using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateHorarioValidator : AbstractValidator<CreateHorarioDto>
{
    public CreateHorarioValidator()
    {
        RuleFor(x => x.PublicacionId)
            .GreaterThan(0).WithMessage("El PublicacionId debe ser mayor a 0.");

        RuleFor(x => x.DiaSemana)
            .InclusiveBetween(0, 6).WithMessage("El día de la semana debe estar entre 0 (domingo) y 6 (sábado).");

        RuleFor(x => x.HoraFin)
            .GreaterThan(x => x.HoraInicio).WithMessage("La hora fin debe ser mayor que la hora inicio.");
    }
}
