using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

public class CreatePublicacioneValidator : AbstractValidator<CreatePublicacioneDto>
{
    public CreatePublicacioneValidator()
    {
        RuleFor(x => x.AnfitrionId)
            .GreaterThan(0).WithMessage("El AnfitrionId debe ser mayor a 0.");

        RuleFor(x => x.CategoriaId)
            .GreaterThan(0).WithMessage("El CategoriaId debe ser mayor a 0.");

        RuleFor(x => x.Titulo)
            .NotEmpty().WithMessage("El título es obligatorio.")
            .MaximumLength(200).WithMessage("El título no puede exceder los 200 caracteres.")
            .MinimumLength(3).WithMessage("El título debe tener al menos 3 caracteres.");

        RuleFor(x => x.Descripcion)
            .MaximumLength(1000).WithMessage("La descripción no puede exceder los 1000 caracteres.");

        RuleFor(x => x.PrecioPorNoche)
            .GreaterThan(0).WithMessage("El precio por noche debe ser mayor a 0.");

        RuleFor(x => x.CapacidadMaxima)
            .GreaterThan(0).WithMessage("La capacidad máxima debe ser mayor a 0.");

        RuleFor(x => x.Habitaciones)
            .GreaterThan(0).When(x => x.Habitaciones.HasValue).WithMessage("Las habitaciones deben ser mayores a 0.");

        RuleFor(x => x.Camas)
            .GreaterThan(0).When(x => x.Camas.HasValue).WithMessage("Las camas deben ser mayores a 0.");

        RuleFor(x => x.Banos)
            .GreaterThan(0).When(x => x.Banos.HasValue).WithMessage("Los baños deben ser mayores a 0.");

        RuleFor(x => x.Latitud)
            .InclusiveBetween(-90, 90).When(x => x.Latitud.HasValue).WithMessage("La latitud debe estar entre -90 y 90.");

        RuleFor(x => x.Longitud)
            .InclusiveBetween(-180, 180).When(x => x.Longitud.HasValue).WithMessage("La longitud debe estar entre -180 y 180.");

        RuleFor(x => x.PuntoEncuentroLatitud)
            .InclusiveBetween(-90, 90).When(x => x.PuntoEncuentroLatitud.HasValue).WithMessage("La latitud del punto de encuentro debe estar entre -90 y 90.");

        RuleFor(x => x.PuntoEncuentroLongitud)
            .InclusiveBetween(-180, 180).When(x => x.PuntoEncuentroLongitud.HasValue).WithMessage("La longitud del punto de encuentro debe estar entre -180 y 180.");

        RuleFor(x => x.DestinoLatitud)
            .InclusiveBetween(-90, 90).When(x => x.DestinoLatitud.HasValue).WithMessage("La latitud del destino debe estar entre -90 y 90.");

        RuleFor(x => x.DestinoLongitud)
            .InclusiveBetween(-180, 180).When(x => x.DestinoLongitud.HasValue).WithMessage("La longitud del destino debe estar entre -180 y 180.");

        // Each map point is a pair: if one half is provided, the other is required.
        RuleFor(x => x)
            .Must(x => x.PuntoEncuentroLatitud.HasValue == x.PuntoEncuentroLongitud.HasValue)
            .WithMessage("El punto de encuentro requiere latitud y longitud juntas.");

        RuleFor(x => x)
            .Must(x => x.DestinoLatitud.HasValue == x.DestinoLongitud.HasValue)
            .WithMessage("El destino requiere latitud y longitud juntas.");
    }
}
