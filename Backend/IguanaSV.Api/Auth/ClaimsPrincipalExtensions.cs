using System.Security.Claims;
using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace IguanaSV.Api.Auth;

/// <summary>
/// Reads the authenticated subject id from the <c>sub</c> claim. The claim name
/// is honored verbatim (<c>MapInboundClaims = false</c> in Program), but a
/// fallback to the standard NameIdentifier/Name types keeps the helper correct
/// even if inbound mapping is ever re-enabled. Shared by <c>/me</c> now and by
/// the per-endpoint ownership checks in W3b.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// The signed-in user's numeric id, or <c>null</c> when the principal carries
    /// no parseable subject. Controllers treat null as "not authenticated".
    /// </summary>
    public static int? GetSubjectId(this ClaimsPrincipal user)
    {
        var value =
            user.FindFirst(AuthConstants.SubClaim)?.Value
            ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? user.FindFirst(ClaimTypes.Name)?.Value;

        return int.TryParse(value, out var id) ? id : null;
    }

    /// <summary>The signed-in user's role claim value (<c>rol</c>), or null.</summary>
    public static string? GetRol(this ClaimsPrincipal user) =>
        user.FindFirst(AuthConstants.RolClaim)?.Value;

    /// <summary>
    /// Fresh admin gate (audit M10): true when the <c>sub</c> claim resolves to a
    /// usuarios row whose current <c>rol</c> column is <c>admin</c> (one
    /// no-tracking query, so a role demotion applies on the very next request
    /// instead of living up to the 60-minute JWT claim TTL). When no row exists
    /// for the subject, the signed JWT <c>rol</c> claim is trusted instead —
    /// such token-only identities occur in the test pipeline and for recently
    /// deleted accounts.
    /// </summary>
    public static async Task<bool> IsFreshAdminAsync(this ClaimsPrincipal user, IguanasDbContext db)
    {
        var sub = user.GetSubjectId();
        if (sub is null)
        {
            return false;
        }

        var rol = await db.Usuarios.AsNoTracking()
            .Where(u => u.Id == sub.Value)
            .Select(u => u.Rol)
            .FirstOrDefaultAsync();

        return rol == AuthConstants.AdminRole
            || (rol is null && user.GetRol() == AuthConstants.AdminRole);
    }
}
