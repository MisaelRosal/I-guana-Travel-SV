using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateReservaHorarioValidator : AbstractValidator<CreateReservaHorarioDto>
{
    public CreateReservaHorarioValidator()
    {
        RuleFor(x => x.ReservaId)
            .GreaterThan(0).WithMessage("El ReservaId debe ser mayor a 0.");

        RuleFor(x => x.HorarioId)
            .GreaterThan(0).WithMessage("El HorarioId debe ser mayor a 0.");
    }
}
