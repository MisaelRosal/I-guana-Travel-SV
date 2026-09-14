using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateExperienciaValidator : AbstractValidator<CreateExperienciaDto>
{
    public CreateExperienciaValidator()
    {
        RuleFor(x => x.PublicacionId)
            .GreaterThan(0).WithMessage("El PublicacionId debe ser mayor a 0.");

        RuleFor(x => x.Nombre)
            .NotEmpty().WithMessage("El nombre es obligatorio.")
            .MaximumLength(200).WithMessage("El nombre no puede exceder los 200 caracteres.")
            .MinimumLength(2).WithMessage("El nombre debe tener al menos 2 caracteres.");

        RuleFor(x => x.Descripcion)
            .MaximumLength(500).WithMessage("La descripción no puede exceder los 500 caracteres.");

        RuleFor(x => x.DuracionHoras)
            .GreaterThan(0).When(x => x.DuracionHoras.HasValue).WithMessage("La duración debe ser mayor a 0 horas.");

        RuleFor(x => x.PrecioAdicional)
            .GreaterThanOrEqualTo(0).When(x => x.PrecioAdicional.HasValue).WithMessage("El precio adicional no puede ser negativo.");
    }
}
