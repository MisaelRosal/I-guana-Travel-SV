using IguanaSV.Api.Tests.Schema;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace IguanaSV.Api.Tests.Overlap;

/// <summary>
/// Reversibility proof for the W5 migration M3
/// (<c>ReplaceRacyIndexesWithExclusions</c>). Runs against a dedicated
/// ephemeral Testcontainers Postgres (never the host DB) driven by the shared
/// <see cref="EfCli"/> runner, mirroring the W2 schema slice. It asserts that
/// applying M3 creates the <c>reservas_no_overlap_lodging</c> exclusion
/// constraint (and the slot-hygiene index), and that rolling back one migration
/// to M2 drops both again — the "Exclusion shipped as reversible migration" /
/// "Migration rollback" spec scenario. Skips when Docker or the dotnet-ef tool is
/// unavailable.
/// </summary>
public sealed class M3ExclusionMigrationTests
{
    // EF migration id of M2, the target that M3's Down must return to.
    private const string M2Ownership = "20260918172757_AddReservaUsuarioOwnership";

    [SkippableFact]
    [Trait("Category", "Overlap")]
    public async Task M3_UpCreatesExclusion_AndDownRemovesIt()
    {
        if (!await EfCli.DockerAvailableAsync())
        {
            Skip.If(true, "Docker daemon is not available: M3 migration test requires Testcontainers.");
        }

        if (!await EfCli.EfToolAvailableAsync())
        {
            Skip.If(true, "The dotnet-ef global tool is not installed.");
        }

        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var conn = postgres.GetConnectionString();

        // Apply everything up to and including M3.
        await EfCli.DatabaseUpdateAsync(targetMigration: null, conn);

        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            var exclusion = await ScalarAsync<string>(db, """
                SELECT contype::text FROM pg_constraint WHERE conname = 'reservas_no_overlap_lodging';
                """);
            Assert.Equal("x", exclusion); // 'x' == exclusion constraint

            var def = await ScalarAsync<string>(db, """
                SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'reservas_no_overlap_lodging';
                """);
            Assert.Contains("daterange(fecha_inicio, fecha_fin, '[)'", def);
            Assert.Contains("IS DISTINCT FROM 'cancelada'", def);

            var slotIndex = await ScalarAsync<long>(db, """
                SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_horarios_fecha_slot';
                """);
            Assert.Equal(1, slotIndex);

            var fakeGist = await ScalarAsync<long>(db, """
                SELECT count(*) FROM pg_indexes WHERE indexname IN ('reservas_no_overlap', 'horarios_no_overlap');
                """);
            Assert.Equal(0, fakeGist); // the fake GiST indexes stay gone

            var history = await ScalarAsync<long>(db, """
                SELECT count(*) FROM "__EFMigrationsHistory";
                """);
            Assert.Equal(9, history);
        }

        // Roll back M3 (one step, to M2). The constraint and hygiene index must
        // disappear; the fake GiST indexes are NOT restored here (that is M1.Down's
        // concern), so they stay absent.
        await EfCli.DatabaseUpdateAsync(M2Ownership, conn);

        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            var exclusion = await ScalarAsync<long>(db, """
                SELECT count(*) FROM pg_constraint WHERE conname = 'reservas_no_overlap_lodging';
                """);
            Assert.Equal(0, exclusion);

            var slotIndex = await ScalarAsync<long>(db, """
                SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_horarios_fecha_slot';
                """);
            Assert.Equal(0, slotIndex);

            var history = await ScalarAsync<long>(db, """
                SELECT count(*) FROM "__EFMigrationsHistory";
                """);
            Assert.Equal(6, history);
        }
    }

    private static async Task<T> ScalarAsync<T>(NpgsqlConnection db, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, db);
        var value = await cmd.ExecuteScalarAsync();
        if (value is null or DBNull)
        {
            throw new InvalidOperationException($"Expected a scalar of type {typeof(T)} but got NULL.");
        }

        var target = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
        return (T)Convert.ChangeType(value, target);
    }
}
