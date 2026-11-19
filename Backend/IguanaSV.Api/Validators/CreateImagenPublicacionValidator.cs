using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateImagenPublicacionValidator : AbstractValidator<CreateImagenPublicacionDto>
{
    public CreateImagenPublicacionValidator()
    {
        RuleFor(x => x.PublicacionId)
            .GreaterThan(0).WithMessage("El PublicacionId debe ser mayor a 0.");

        RuleFor(x => x.Url)
            .NotEmpty().WithMessage("La URL es obligatoria.")
            .MaximumLength(500).WithMessage("La URL no puede exceder los 500 caracteres.")
            .Must(u => Uri.TryCreate(u, UriKind.Absolute, out _)).WithMessage("La URL no es válida.");

        RuleFor(x => x.Orden)
            .GreaterThanOrEqualTo(0).When(x => x.Orden.HasValue).WithMessage("El orden no puede ser negativo.");
    }
}
