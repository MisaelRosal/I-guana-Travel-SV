using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateDepartamentoValidator : AbstractValidator<CreateDepartamentoDto>
{
    public CreateDepartamentoValidator()
    {
        RuleFor(x => x.Nombre)
            .NotEmpty().WithMessage("El nombre es obligatorio.")
            .MaximumLength(150).WithMessage("El nombre no puede exceder los 150 caracteres.")
            .MinimumLength(2).WithMessage("El nombre debe tener al menos 2 caracteres.");
    }
}
