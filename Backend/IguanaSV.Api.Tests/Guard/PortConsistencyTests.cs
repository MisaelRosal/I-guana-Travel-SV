using System.Text.RegularExpressions;
using Xunit;

namespace IguanaSV.Api.Tests.Guard;

/// <summary>
/// Guard for the aligned local API port requirement (design TD1): the API listen
/// URL (launchSettings), the Vite <c>/api</c> proxy target, and the published
/// Docker host port must all resolve to one canonical port so a single command
/// starts a working stack. The stale <c>:5100</c> is the divergence this locks out.
/// Traces: secrets-config-hygiene "Aligned local API port".
/// </summary>
public class PortConsistencyTests
{
    private const int CanonicalPort = 5000;

    // Only the http scheme is bound to the canonical dev port; the https profile
    // keeps its own 7xxx port and is intentionally not compared here.
    private static readonly Regex HttpUrl = new(@"http://localhost:(\d+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static string ReadTracked(string relativePath) =>
        File.ReadAllText(Path.Combine(GuardScan.RepoRoot, relativePath));

    [Trait("Category", "Guard")]
    [Fact]
    public void LaunchSettings_HttpUrls_UseCanonicalPort()
    {
        var content = ReadTracked("Backend/IguanaSV.Api/Properties/launchSettings.json");

        Assert.DoesNotContain(":5100", content);

        var ports = HttpUrl.Matches(content).Select(m => int.Parse(m.Groups[1].Value)).ToList();
        Assert.NotEmpty(ports);
        Assert.All(ports, port => Assert.Equal(CanonicalPort, port));
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void ViteProxy_TargetsCanonicalPort()
    {
        var content = ReadTracked("Frontend/vite.config.js");

        Assert.DoesNotContain(":5100", content);

        var port = Assert.Single(HttpUrl.Matches(content).Select(m => int.Parse(m.Groups[1].Value)));
        Assert.Equal(CanonicalPort, port);
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void Compose_BackendPublishesCanonicalHostPort()
    {
        // docker-compose "backend" maps "<host>:<container>"; host must be canonical.
        var compose = ReadTracked("docker-compose.yml");
        var backendBlock = Regex.Match(
            compose,
            @"backend:.*?depends_on",
            RegexOptions.Singleline | RegexOptions.IgnoreCase);
        Assert.True(backendBlock.Success, "Could not locate the backend service block in docker-compose.yml");

        var hostPort = Regex.Match(backendBlock.Value, @"""?(\d+):\d+""?");
        Assert.True(hostPort.Success, "Backend service does not publish a host:container port mapping");
        Assert.Equal(CanonicalPort, int.Parse(hostPort.Groups[1].Value));
    }

    [Trait("Category", "Guard")]
    [Fact]
    public void AllConsumers_AgreeOnSingleCanonicalPort()
    {
        var launchSettings = HttpUrl
            .Matches(ReadTracked("Backend/IguanaSV.Api/Properties/launchSettings.json"))
            .Select(m => int.Parse(m.Groups[1].Value));
        var vite = HttpUrl
            .Matches(ReadTracked("Frontend/vite.config.js"))
            .Select(m => int.Parse(m.Groups[1].Value));

        var distinct = launchSettings.Concat(vite).Distinct().ToList();
        Assert.Single(distinct);
        Assert.Equal(CanonicalPort, distinct[0]);
    }
}
