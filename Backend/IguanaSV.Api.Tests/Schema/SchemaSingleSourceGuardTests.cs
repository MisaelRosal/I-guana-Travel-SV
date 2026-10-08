using IguanaSV.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Xunit.Abstractions;

namespace IguanaSV.Api.Tests.Schema;

/// <summary>
/// Guards for the `schema-single-source` capability: the EF model MUST match the
/// generated migrations (no silent drift), `init.sql` is retired in favour of an
/// idempotent, DDL-free `seed.sql`, and docker-compose applies migrations through
/// a one-shot `migrator` service before the backend or any seeding runs.
/// These are pure file/model inspections — no database connection is opened.
/// </summary>
public sealed class SchemaSingleSourceGuardTests
{
    private readonly ITestOutputHelper _output;

    public SchemaSingleSourceGuardTests(ITestOutputHelper output) => _output = output;

    // ---- Task 2.5: model drift guard -------------------------------------------------

    [Fact]
    [Trait("Category", "Schema")]
    public void DbContextModel_HasNoPendingChangesAgainstMigrationSnapshot()
    {
        // A syntactically valid but never-connected connection string: HasPendingModelChanges
        // compares the design-time model with the latest ModelSnapshot and never touches the server.
        var options = new DbContextOptionsBuilder<IguanasDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=drift_guard_unused;Username=unused;Password=unused")
            .Options;

        using var context = new IguanasDbContext(options);

        var pending = context.Database.HasPendingModelChanges();
        _output.WriteLine($"HasPendingModelChanges = {pending}");
        Assert.False(pending,
            "IguanasDbContext has changes that are not captured by any migration " +
            "(dotnet ef migrations has-pending-model-changes would be non-empty).");
    }

    // ---- Task 2.6/2.8: seed demotion and retired schema sources -----------------------

    [Fact]
    [Trait("Category", "Schema")]
    public void InitSqlIsRetired_AndAddScriptsAndMigrationsShellAreDeleted()
    {
        var root = Guard.GuardScan.RepoRoot;

        Assert.False(File.Exists(Path.Combine(root, "database", "init.sql")),
            "database/init.sql must be retired: EF migrations own the schema.");

        Assert.False(File.Exists(Path.Combine(root, "Backend", "run-migrations.sh")),
            "Backend/run-migrations.sh must be retired: the compose migrator service owns startup.");

        foreach (var file in new[]
                 {
                     "add_fecha_horarios.sql",
                     "add_pago_reserva.sql",
                     "add_categorias_experiencias.sql",
                     "add_experiencias_futuras.sql",
                 })
        {
            Assert.False(File.Exists(Path.Combine(root, "database", file)),
                $"database/{file} must be retired as a patch source; its schema is in migrations " +
                "and any reference data lives in seed.sql.");
        }
    }

    [Fact]
    [Trait("Category", "Schema")]
    public void SeedSql_ContainsNoSchemaDdl_AndEveryInsertIsExistenceGuarded()
    {
        var seedPath = Path.Combine(Guard.GuardScan.RepoRoot, "database", "seed.sql");
        Assert.True(File.Exists(seedPath), "database/seed.sql must exist and carry the reference data.");

        var text = File.ReadAllText(seedPath);

        string[] forbidden =
        [
            "CREATE TABLE", "ALTER TABLE", "DROP TABLE",
            "CREATE INDEX", "CREATE UNIQUE INDEX", "DROP INDEX",
            "CREATE EXTENSION",
        ];

        foreach (var token in forbidden)
        {
            Assert.False(
                text.Contains(token, StringComparison.OrdinalIgnoreCase),
                $"database/seed.sql must not contain schema DDL (found \"{token}\"): " +
                "EF migrations are the single source of truth for the schema.");
        }

        // Reference data must still be present and guarded for idempotent re-runs.
        Assert.Contains("INSERT INTO departamentos", text, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ON CONFLICT", text, StringComparison.OrdinalIgnoreCase);
        // Reference-data-only demotion (v0.6): the seed must NOT resurrect demo rows;
        // anfitriones/publicaciones/reservas are created by real users through the app.
        Assert.DoesNotContain("INSERT INTO publicaciones", text, StringComparison.OrdinalIgnoreCase);
    }

    // ---- Task 2.7: compose wiring ------------------------------------------------------

    [Fact]
    [Trait("Category", "Schema")]
    public void Compose_RunsMigratorBeforeBackend_AndDropsInitdbMount()
    {
        var compose = File.ReadAllText(Path.Combine(Guard.GuardScan.RepoRoot, "docker-compose.yml"));

        Assert.DoesNotContain("docker-entrypoint-initdb.d", compose, StringComparison.Ordinal);
        Assert.Contains("Migrator.Dockerfile", compose, StringComparison.Ordinal);
        Assert.Contains("migrator:", compose, StringComparison.Ordinal);
        Assert.Contains("service_completed_successfully", compose, StringComparison.Ordinal);

        // The seed must be mounted into the migrator, not the postgres data directory.
        Assert.Contains("./database:/sql", compose.Replace('\\', '/'), StringComparison.Ordinal);
    }

    // ---- Task 2.2: backfill statement is embedded in the M2 migration ------------------

    [Fact]
    [Trait("Category", "Schema")]
    public void M2Migration_DefinesCaseInsensitiveTrimmedBackfill()
    {
        var dir = Path.Combine(Guard.GuardScan.RepoRoot, "Backend", "IguanaSV.Api", "Migrations");
        var file = Directory.GetFiles(dir, "*_AddReservaUsuarioOwnership.cs").Single();
        var text = File.ReadAllText(file);

        Assert.Contains("UPDATE reservas r", text, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SET usuario_id = u.id", text, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("FROM usuarios u", text, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("lower(btrim(r.email_huesped)) = lower(btrim(u.email))", text.Replace('`', '\''),
            StringComparison.OrdinalIgnoreCase);
    }
}
