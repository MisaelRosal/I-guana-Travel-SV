using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateReservaValidator : AbstractValidator<CreateReservaDto>
{
    public CreateReservaValidator()
    {
        RuleFor(x => x.PublicacionId)
            .GreaterThan(0).WithMessage("El PublicacionId debe ser mayor a 0.");

        RuleFor(x => x.NombreHuesped)
            .NotEmpty().WithMessage("El nombre del huésped es obligatorio.")
            .MaximumLength(100).WithMessage("El nombre no puede exceder los 100 caracteres.")
            .MinimumLength(2).WithMessage("El nombre debe tener al menos 2 caracteres.");

        RuleFor(x => x.EmailHuesped)
            .NotEmpty().WithMessage("El email del huésped es obligatorio.")
            .EmailAddress().WithMessage("El email no es válido.")
            .MaximumLength(150).WithMessage("El email no puede exceder los 150 caracteres.");

        RuleFor(x => x.TelefonoHuesped)
            .MaximumLength(20).WithMessage("El teléfono no puede exceder los 20 caracteres.");

        RuleFor(x => x.FechaFin)
            .GreaterThanOrEqualTo(x => x.FechaInicio).WithMessage("La fecha fin debe ser mayor o igual a la fecha inicio.");

        RuleFor(x => x.NumeroHuespedes)
            .GreaterThan(0).WithMessage("El número de huéspedes debe ser mayor a 0.");

        RuleFor(x => x.PrecioTotal)
            .GreaterThan(0).WithMessage("El precio total debe ser mayor a 0.");
    }
}
