using System;

namespace IguanaSV.Api.Entities;

/// <summary>
/// One pending email-verification challenge for a newly registered user. The
/// code itself is never stored: only its SHA-256 hash, so a database leak
/// cannot be replayed to activate an account. An unused, unexpired row is the
/// only thing that can complete the registration (spec: "verify the email is
/// real in order to complete registration").
/// </summary>
public partial class VerificacionEmail
{
    public int Id { get; set; }

    public int UsuarioId { get; set; }

    /// <summary>
    /// <c>{salt}:{SHA256(salt + codigo)}</c>, both hex. Storing a per-row salt
    /// alongside the digest means a stolen database cannot be brute-forced
    /// offline against the 10^6 possible 6-digit codes.
    /// </summary>
    public string CodigoHash { get; set; } = null!;

    public DateTime ExpiraAt { get; set; }

    public bool Usado { get; set; }

    public DateTime CreadoEn { get; set; }

    public virtual Usuario Usuario { get; set; } = null!;
}
