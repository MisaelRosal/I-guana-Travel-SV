using System.Security.Cryptography;
using System.Text;
using IguanaSV.Api.Entities;
using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IguanaSV.Api.Services;

/// <summary>
/// Issues and checks the 6-digit codes that prove control of a mailbox.
/// Only a salted SHA-256 digest is persisted, so the plaintext code exists
/// solely in the outbound email and in the immediate log line.
/// </summary>
public class VerificationCodeService
{
    private const int CodigoDigitos = 6;

    private readonly IguanasDbContext _context;
    private readonly EmailOptions _options;

    public VerificationCodeService(IguanasDbContext context, IOptions<EmailOptions> options)
    {
        _context = context;
        _options = options.Value;
    }

    /// <summary>
    /// Invalidate any outstanding challenge and issue a fresh one. Returns the
    /// plaintext code (the only copy) so the caller can put it in the email.
    /// Invalidation is scoped to the same <paramref name="proposito"/>, so
    /// re-sending a reset code never burns a pending registration code.
    /// </summary>
    public async Task<string> GenerarAsync(int usuarioId, string proposito = "registro")
    {
        // Only the newest challenge is valid: re-sending always supersedes the
        // previous code, so a stale email can never activate an account later.
        var anteriores = await _context.VerificacionesEmail
            .Where(v => v.UsuarioId == usuarioId && v.Proposito == proposito && !v.Usado)
            .ToListAsync();
        foreach (var anterior in anteriores)
        {
            anterior.Usado = true;
        }

        var codigo = RandomNumberGenerator.GetInt32(0, (int)Math.Pow(10, CodigoDigitos))
            .ToString($"D{CodigoDigitos}");

        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

        _context.VerificacionesEmail.Add(new VerificacionEmail
        {
            UsuarioId = usuarioId,
            Proposito = proposito,
            CodigoHash = $"{salt}:{Hash(salt, codigo)}",
            ExpiraAt = DateTime.Now.AddMinutes(
                Math.Max(1, _options.VerificacionExpiraMinutos)),
            Usado = false,
            CreadoEn = DateTime.Now,
        });
        await _context.SaveChangesAsync();

        return codigo;
    }

    /// <summary>
    /// Consume a code: succeeds only for the newest unused, unexpired challenge
    /// issued for the same <paramref name="proposito"/> (a registration code is
    /// never accepted as a password-reset code, or vice versa).
    /// A wrong code does NOT invalidate the challenge (so a typo does not force
    /// a resend), but it is rate-limited at the endpoint that calls this.
    /// </summary>
    public async Task<bool> VerificarAsync(int usuarioId, string codigo, string proposito = "registro")
    {
        codigo = (codigo ?? string.Empty).Trim();

        // Materialize the app clock BEFORE composing the query: Npgsql translates
        // an inline DateTime.Now into the DATABASE's now() (session UTC), while
        // ExpiraAt is written with the app's local clock — mixing the two makes
        // every fresh challenge look already expired whenever the app and the
        // Postgres container run in different time zones. A local variable
        // travels as a .NET parameter, so read and write use the same clock.
        var ahora = DateTime.Now;

        var desafio = await _context.VerificacionesEmail
            .Where(v => v.UsuarioId == usuarioId && v.Proposito == proposito && !v.Usado && v.ExpiraAt > ahora)
            .OrderByDescending(v => v.Id)
            .FirstOrDefaultAsync();

        if (desafio is null)
        {
            return false;
        }

        var partes = desafio.CodigoHash.Split(':', 2);
        if (partes.Length != 2 || partes[0].Length == 0)
        {
            return false;
        }

        if (!FixedTimeEquals(partes[1], Hash(partes[0], codigo)))
        {
            return false;
        }

        desafio.Usado = true;
        await _context.SaveChangesAsync();
        return true;
    }

    /// <summary>True when verification is switched off, i.e. accounts activate instantly.</summary>
    public bool VerificacionDeshabilitada => !_options.VerificacionHabilitada;

    private static string Hash(string salt, string codigo)
    {
        var bytes = Encoding.UTF8.GetBytes(salt + codigo);
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
