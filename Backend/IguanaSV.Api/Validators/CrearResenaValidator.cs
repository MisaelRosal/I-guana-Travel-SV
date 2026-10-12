using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CrearResenaValidator : AbstractValidator<CrearResenaDto>
{
    public CrearResenaValidator()
    {
        RuleFor(x => x.ReservaId)
            .GreaterThan(0).WithMessage("El ReservaId debe ser mayor a 0.");

        RuleFor(x => x.Calificacion)
            .Must(c => c >= 0 && c <= 5).WithMessage("La calificación debe estar entre 0 y 5 estrellas.");

        RuleFor(x => x.Comentario)
            .MaximumLength(500).WithMessage("El comentario no puede exceder los 500 caracteres.");
    }
}

public class ResponderResenaValidator : AbstractValidator<ResponderResenaDto>
{
    public ResponderResenaValidator()
    {
        RuleFor(x => x.Respuesta)
            .MaximumLength(500).WithMessage("La respuesta no puede exceder los 500 caracteres.");
    }
}
