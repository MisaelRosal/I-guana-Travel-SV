using IguanaSV.Api.Auth;
using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Middleware;

/// <summary>
/// Rejects authenticated requests whose account was banned or soft-deleted
/// after the JWT was issued. Without this check, a blocked user could keep
/// using the session until the token expires.
/// </summary>
public sealed class AccountStatusMiddleware
{
    private readonly RequestDelegate _next;

    public AccountStatusMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IguanasDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var sub = context.User.GetSubjectId();
            if (sub.HasValue)
            {
                var estado = await db.Usuarios
                    .AsNoTracking()
                    .Where(u => u.Id == sub.Value)
                    .Select(u => new { u.Baneado, u.Eliminado })
                    .FirstOrDefaultAsync(context.RequestAborted);

                if (estado == null || estado.Baneado || estado.Eliminado)
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsJsonAsync(
                        new { mensaje = "Tu cuenta está bloqueada o fue eliminada." },
                        context.RequestAborted);
                    return;
                }
            }
        }

        await _next(context);
    }
}
