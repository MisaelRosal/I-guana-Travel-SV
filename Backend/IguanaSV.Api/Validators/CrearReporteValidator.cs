using FluentValidation;
using IguanaSV.Api.Controllers;

namespace IguanaSV.Api.Validators;

/// <summary>
/// M3: guest reports (ModalReporteHuesped) only offer the 'dano', 'perjuicio'
/// and 'otro' types, and the description is bounded like the UI field. Applied
/// automatically by FluentValidation on POST /api/Reporte.
/// </summary>
public class CrearReporteValidator : AbstractValidator<ReporteController.CrearReporteDto>
{
    private static readonly string[] TiposValidos = ["dano", "perjuicio", "otro"];

    public CrearReporteValidator()
    {
        RuleFor(x => x.ReservaId)
            .GreaterThan(0).WithMessage("El ReservaId debe ser mayor a 0.");

        RuleFor(x => x.Tipo)
            .Must(t => TiposValidos.Contains((t ?? string.Empty).Trim().ToLowerInvariant()))
            .WithMessage("El tipo debe ser 'dano', 'perjuicio' u 'otro'.");

        RuleFor(x => x.Descripcion)
            .NotEmpty().WithMessage("La descripción es obligatoria.")
            .MaximumLength(1000).WithMessage("La descripción no puede exceder los 1000 caracteres.");
    }
}
