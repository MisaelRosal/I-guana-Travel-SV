using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreatePublicacionAmenidadValidator : AbstractValidator<CreatePublicacionAmenidadDto>
{
    public CreatePublicacionAmenidadValidator()
    {
        RuleFor(x => x.PublicacionId)
            .GreaterThan(0).WithMessage("El PublicacionId debe ser mayor a 0.");

        RuleFor(x => x.AmenidadId)
            .GreaterThan(0).WithMessage("El AmenidadId debe ser mayor a 0.");
    }
}
