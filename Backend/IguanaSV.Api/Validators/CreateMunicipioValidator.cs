using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateMunicipioValidator : AbstractValidator<CreateMunicipioDto>
{
    public CreateMunicipioValidator()
    {
        RuleFor(x => x.DepartamentoId)
            .GreaterThan(0).WithMessage("El DepartamentoId debe ser mayor a 0.");

        RuleFor(x => x.Nombre)
            .NotEmpty().WithMessage("El nombre es obligatorio.")
            .MaximumLength(100).WithMessage("El nombre no puede exceder los 100 caracteres.")
            .MinimumLength(2).WithMessage("El nombre debe tener al menos 2 caracteres.");
    }
}
