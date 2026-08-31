using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateAmenidadValidator : AbstractValidator<CreateAmenidadDto>
{
    public CreateAmenidadValidator()
    {
        RuleFor(x => x.Nombre)
            .NotEmpty().WithMessage("El nombre es obligatorio.")
            .MaximumLength(50).WithMessage("El nombre no puede exceder los 50 caracteres.")
            .MinimumLength(2).WithMessage("El nombre debe tener al menos 2 caracteres.");

        RuleFor(x => x.Icono)
            .MaximumLength(50).WithMessage("El icono no puede exceder los 50 caracteres.");
    }
}
