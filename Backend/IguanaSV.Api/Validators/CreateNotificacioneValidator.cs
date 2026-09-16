using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreateNotificacioneValidator : AbstractValidator<CreateNotificacioneDto>
{
    public CreateNotificacioneValidator()
    {
        RuleFor(x => x.ReservaId)
            .GreaterThan(0).WithMessage("El ReservaId debe ser mayor a 0.");

        RuleFor(x => x.Tipo)
            .NotEmpty().WithMessage("El tipo es obligatorio.")
            .MaximumLength(30).WithMessage("El tipo no puede exceder los 30 caracteres.");

        RuleFor(x => x.Mensaje)
            .NotEmpty().WithMessage("El mensaje es obligatorio.")
            .MaximumLength(500).WithMessage("El mensaje no puede exceder los 500 caracteres.");

        RuleFor(x => x.DestinatarioEmail)
            .NotEmpty().WithMessage("El email del destinatario es obligatorio.")
            .EmailAddress().WithMessage("El email del destinatario no es válido.")
            .MaximumLength(150).WithMessage("El email no puede exceder los 150 caracteres.");
    }
}
