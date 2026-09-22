using System.Diagnostics;
using System.Text.RegularExpressions;

namespace IguanaSV.Api.Tests.Guard;

/// <summary>
/// Shared helpers for repository-wide guard tests: repo-root discovery,
/// enumeration of git-tracked files, and classification of configuration
/// values as either a real secret or a documented non-secret placeholder.
/// </summary>
internal static class GuardScan
{
    /// <summary>
    /// Walk up from the test assembly output directory until the directory
    /// that contains the <c>.git</c> folder is found. That directory is the
    /// repository root regardless of the current working directory.
    /// </summary>
    public static string RepoRoot
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, ".git")))
            {
                dir = dir.Parent;
            }

            return dir?.FullName
                ?? throw new InvalidOperationException(
                    "Could not locate the repository root (.git directory) above " + AppContext.BaseDirectory);
        }
    }

    /// <summary>
    /// Return the absolute paths of every file tracked by git in the repository.
    /// This is the authoritative "tracked files" set the secret-leak spec requires:
    /// gitignored local overrides such as <c>.env</c> are intentionally excluded.
    /// </summary>
    public static IReadOnlyList<string> TrackedFiles()
    {
        var output = RunGit(RepoRoot, "ls-files");
        return output
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(rel => Path.Combine(RepoRoot, rel.Replace('/', Path.DirectorySeparatorChar)))
            .ToList();
    }

    /// <summary>
    /// True when a captured configuration value is a safe, non-secret placeholder:
    /// an environment/compose reference (<c>${VAR}</c>, <c>$VAR</c>), a JSON/CI
    /// template reference (<c>{{...}}</c>), a documented sentinel wrapped in angle
    /// brackets (<c>&lt;set-via-user-secrets&gt;</c>), or empty.
    /// </summary>
    public static bool IsPlaceholder(string value)
    {
        value = value.Trim().Trim('"', '\'');
        if (value.Length == 0)
        {
            return true;
        }

        if (value.StartsWith('$') || value.StartsWith('{') || value.StartsWith("{{"))
        {
            return true;
        }

        if (value.StartsWith('<') && value.EndsWith('>'))
        {
            return true;
        }

        return AllowedPlaceholderTokens.Contains(value.ToLowerInvariant());
    }

    private static readonly HashSet<string> AllowedPlaceholderTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "changeme",
        "change-me",
        "replace-me",
        "replaceme",
        "your-password-here",
        "your-minio-password-here",
        "set-via-env",
        "set-via-user-secrets",
    };

    private static string RunGit(string workingDirectory, string arguments)
    {
        var psi = new ProcessStartInfo("git", arguments)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start the git process.");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {arguments} failed ({process.ExitCode}): {stderr}");
        }

        return stdout;
    }
}
