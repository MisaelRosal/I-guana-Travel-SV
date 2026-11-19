namespace IguanaSV.Api.Tests.AuthN;

/// <summary>
/// Resolves the content root for the in-process API host.
/// <para>
/// The SDK-generated MvcTestingAppManifest.json embeds the API project directory
/// as an MSBuild property function
/// (<c>$([System.IO.Path]::GetDirectoryName('...'))</c>). A repository path that
/// itself contains an apostrophe (e.g. <c>...\API's\...</c>) breaks that
/// expression, so WebApplicationFactory receives a non-existent folder and every
/// host-based test fails to start. Resolving the directory directly from the
/// loaded API assembly is a no-op on clean paths and keeps the suite runnable
/// regardless of where the repository lives.
/// </para>
/// </summary>
internal static class TestContentRoot
{
    public static string Resolve()
    {
        var assemblyDir = Path.GetDirectoryName(typeof(Program).Assembly.Location)!;
        var dir = new DirectoryInfo(assemblyDir);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "IguanaSV.Api.csproj")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? assemblyDir;
    }
}
