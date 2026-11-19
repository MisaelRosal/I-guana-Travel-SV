using System.Diagnostics;

namespace IguanaSV.Api.Tests.AuthN;

/// <summary>
/// Best-effort environment probes shared by the AuthN integration tests. These
/// mirror the graceful-skip behaviour of the schema slice so the suite is green
/// (with skips) on machines without a Docker daemon.
/// </summary>
internal static class Probe
{
    public static bool DockerAvailable()
    {
        try
        {
            var psi = new ProcessStartInfo("docker", "version")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var process = Process.Start(psi);
            if (process is null)
            {
                return false;
            }

            process.WaitForExit(15000);
            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
