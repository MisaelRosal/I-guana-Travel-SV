using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

/// <summary>
/// Send-message rules (spec THM6/THM7): the text is trimmed first, must not be
/// empty and must not exceed 500 characters. The DB check constraint
/// `mensajes_mensaje_check` mirrors the cap as the last line of defense.
/// </summary>
public class CreateMensajeValidator : AbstractValidator<CrearMensajeDto>
{
    public CreateMensajeValidator()
    {
        RuleFor(x => x.Mensaje)
            .Must(texto => !string.IsNullOrWhiteSpace(texto))
            .WithMessage("El mensaje no puede estar vacío.")
            .Must(texto => texto is null || texto.Trim().Length <= 500)
            .WithMessage("El mensaje no puede exceder los 500 caracteres.");
    }
}
