using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace IguanaSV.Api.Middleware;

/// <summary>
/// Shapes every model-validation 400 into the app's standard { mensaje } body
/// so the SPA (which reads detalle.mensaje) can show WHICH rule failed instead
/// of the generic "Error 400: Bad Request". Registered first (order -2000) so
/// the auto-validation machinery already produced ModelState errors: those get
/// projected here and any later short-circuited result is replaced.
/// </summary>
public sealed class ValidationMessageFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (context.ModelState.IsValid)
        {
            return;
        }

        var mensaje = context.ModelState.Values
            .SelectMany(v => v.Errors)
            .Select(e => e.ErrorMessage)
            .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m))
            ?? "Los datos enviados no son válidos.";

        context.Result = new BadRequestObjectResult(new { mensaje });
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}
