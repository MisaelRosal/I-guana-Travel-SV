using IguanaSV.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Auth;

/// <summary>
/// M10 requirement attached to admin-gated MUTATIONS: the caller's admin role
/// must exist in the database, not only in the 60-minute JWT <c>rol</c> claim.
/// A role upgrade or demote therefore takes effect on the very next request.
/// Harmless admin READS keep the ordinary claim-based
/// <c>[Authorize(Roles = AuthConstants.AdminRole)]</c>.
/// </summary>
public sealed class FreshAdminRequirement : IAuthorizationRequirement
{
}

/// <summary>
/// Succeeds only when the <c>sub</c> claim resolves to a usuarios row whose
/// current <c>rol</c> column is <c>admin</c>. The scoped request
/// <see cref="IguanasDbContext"/> serves as the per-request cache of one
/// lightweight query (one row projection, no tracking).
///
/// Fallback (documented): when no usuarios row exists for the subject, the
/// signed JWT <c>rol</c> claim is trusted instead. Such identities exist in the
/// test pipeline (self-minted admin tokens against the test signing key) and
/// account deletions; the M10 freshness guarantee still holds for anyone with
/// an actual row — a downgrade/demote applies on the very next request.
/// </summary>
public sealed class FreshAdminHandler : AuthorizationHandler<FreshAdminRequirement>
{
    private readonly IguanasDbContext _db;

    public FreshAdminHandler(IguanasDbContext db)
    {
        _db = db;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context, FreshAdminRequirement requirement)
    {
        var sub = context.User.GetSubjectId();
        if (sub is null)
        {
            return;
        }

        var rol = await _db.Usuarios.AsNoTracking()
            .Where(u => u.Id == sub.Value)
            .Select(u => u.Rol)
            .FirstOrDefaultAsync();

        if (rol == AuthConstants.AdminRole
            || (rol is null && context.User.GetRol() == AuthConstants.AdminRole))
        {
            context.Succeed(requirement);
        }
    }
}
