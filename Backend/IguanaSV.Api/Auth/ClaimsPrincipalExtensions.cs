using System.Security.Claims;

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
}
