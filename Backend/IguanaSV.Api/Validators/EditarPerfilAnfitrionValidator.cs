using FluentValidation;
using IguanaSV.Api.DTOs;

namespace IguanaSV.Api.Validators;

/// <summary>
/// Rules for the host self-profile PUT (EditarPerfilAnfitrionDto). Field
/// bounds mirror CreateAnfitrioneValidator (email ≤150, telefono ≤20). The
/// payload is partial, so every rule only applies when the field is present;
/// an auto-registered validator cannot hit the DB, therefore municipio
/// existence is checked in the controller instead.
/// </summary>
public class EditarPerfilAnfitrionValidator : AbstractValidator<EditarPerfilAnfitrionDto>
{
    public EditarPerfilAnfitrionValidator()
    {
        RuleFor(x => x.Email)
            .EmailAddress().WithMessage("El email no es válido.")
            .MaximumLength(150).WithMessage("El email no puede exceder los 150 caracteres.");

        RuleFor(x => x.Telefono)
            .MaximumLength(20).WithMessage("El teléfono no puede exceder los 20 caracteres.");

        RuleFor(x => x.MunicipioId)
            .GreaterThan(0).WithMessage("El MunicipioId debe ser mayor a 0.")
            .When(x => x.MunicipioId.HasValue);
    }
}
