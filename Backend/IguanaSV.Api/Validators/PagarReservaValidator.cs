using FluentValidation;
using IguanaSV.Api.Models;

namespace IguanaSV.Api.Validators;

/// <summary>
/// M3: the simulated payment only accepts the methods the SPA actually offers
/// (ReservationsPage METODOS_PAGO). Anything else is a 400 instead of a free
/// 30-char string stamped into reservas.metodo_pago.
/// </summary>
public class PagarReservaValidator : AbstractValidator<PagarReservaDto>
{
    private static readonly string[] MetodosValidos = ["tarjeta_credito", "tarjeta_debito", "paypal"];

    public PagarReservaValidator()
    {
        RuleFor(x => x.MetodoPago)
            .NotEmpty().WithMessage("El método de pago es obligatorio.")
            .Must(m => MetodosValidos.Contains(m))
            .WithMessage("El método de pago debe ser 'tarjeta_credito', 'tarjeta_debito' o 'paypal'.");
    }
}
