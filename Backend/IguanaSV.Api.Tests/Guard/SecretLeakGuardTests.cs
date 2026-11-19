using System.Text.RegularExpressions;
using Xunit;

namespace IguanaSV.Api.Tests.Guard;

/// <summary>
/// Guard for the <c>secrets-config-hygiene</c> spec: no real credential values may
/// appear in git-tracked configuration. The detector is value-shape based (a
/// concrete value assigned to a DB password or MinIO credential is a violation
/// unless it is an env/template placeholder), so it rejects the previously
/// committed secrets and any future literal without embedding those literals in
/// the repository itself.
/// Traces: secrets-config-hygiene "No secrets in tracked files" + "Secret-leak guard".
/// </summary>
public class SecretLeakGuardTests
{
    // PostgreSQL connection-string password: a "Password=" segment inside a
    // "Host=...;...;Password=..." connection string.
    private static readonly Regex DbPassword =
        new(@";\s*password\s*=\s*([^;""'\r\n]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // MinIO credentials by their concrete key names only (so unrelated *_PASSWORD
    // YAML keys such as pgadmin's are not treated as leaked secrets). The explicit
    // lookarounds (instead of \b) let us match keys that follow an underscore, as in
    // docker-compose "Minio__SecretKey", without matching a token inside a longer word.
    private static readonly Regex MinioCredential =
        new(@"(?<![A-Za-z0-9])(secretkey|accesskey|minio_root_password|minio_root_user)(?![A-Za-z0-9])\s*[=:]\s*""?([^""'\r\n,]+)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Configuration-shaped, git-tracked files the scan must cover.
    private static readonly string[] ScannedExtensions = { ".json", ".yml", ".yaml", ".sh", ".env" };

    [Trait("Category", "Guard")]
    [Fact]
    public void TrackedConfigFiles_HaveNoCommittedSecrets()
    {
        var violations = new List<string>();

        foreach (var path in GuardScan.TrackedFiles())
        {
            if (!ShouldScan(path))
            {
                continue;
            }

            var relative = ToRelative(path);
            var lines = File.ReadAllLines(path);
            for (var i = 0; i < lines.Length; i++)
            {
                foreach (var match in FindViolations(lines[i]))
                {
                    // Report the offending key/line but never echo the value itself.
                    violations.Add($"{relative}:{i + 1} -> {match}");
                }
            }
        }

        Assert.True(
            violations.Count == 0,
            "Tracked configuration must not contain real credential values. " +
            "Move them to user-secrets (dev) or environment variables (docker). Offending " +
            "locations (value not shown):\n" + string.Join("\n", violations));
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void Detector_FlagsConcreteDbPassword()
    {
        var hits = FindViolations("Host=db;Port=5432;Database=x;Username=u;Password=supersecret123");
        Assert.NotEmpty(hits);
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void Detector_FlagsConcreteMinioSecret()
    {
        var hits = FindViolations("Minio__SecretKey = admin123456");
        Assert.NotEmpty(hits);
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void Detector_FlagsComposeStyleUnderscoreSecret()
    {
        // docker-compose uses Minio__* / ConnectionStrings__* env keys; a concrete
        // value on an underscore-prefixed key must still be caught.
        Assert.NotEmpty(FindViolations("Minio__AccessKey=hardcodedkey"));
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void Detector_AllowsEnvAndSentinelPlaceholders()
    {
        Assert.Empty(FindViolations("Password=${POSTGRES_PASSWORD}"));
        Assert.Empty(FindViolations("\"AccessKey\": \"<set-via-user-secrets>\""));
        Assert.Empty(FindViolations("MINIO_ROOT_USER: ${MINIO_ROOT_USER}"));
    }

    /// <summary>
    /// Inspect a single line and return descriptions of credential assignments whose
    /// value is a concrete secret (not a placeholder). Returns nothing safe.
    /// </summary>
    private static IEnumerable<string> FindViolations(string line)
    {
        foreach (Match m in DbPassword.Matches(line))
        {
            if (!GuardScan.IsPlaceholder(m.Groups[1].Value))
            {
                yield return "DB connection Password=<redacted>";
            }
        }

        foreach (Match m in MinioCredential.Matches(line))
        {
            if (!GuardScan.IsPlaceholder(m.Groups[2].Value))
            {
                yield return $"MinIO {m.Groups[1].Value}=<redacted>";
            }
        }
    }

    private static bool ShouldScan(string absolutePath)
    {
        var relative = ToRelative(absolutePath).Replace('\\', '/');

        if (!ScannedExtensions.Contains(Path.GetExtension(relative)))
        {
            return false;
        }

        // The committed template lists keys with placeholder values by design.
        if (relative.EndsWith(".env.example", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // CI workflows provision throwaway, non-production test credentials for an
        // ephemeral compose run; they are fixtures, not real secrets.
        if (relative.StartsWith(".github/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // Lockfiles are generated and irrelevant to credential hygiene.
        if (Path.GetFileName(relative).Equals("package-lock.json", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return true;
    }

    private static string ToRelative(string absolutePath) =>
        Path.GetRelativePath(GuardScan.RepoRoot, absolutePath);
}
