using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;
using Xunit.Abstractions;

namespace IguanaSV.Api.Tests.Schema;

/// <summary>
/// Real-database integration tests for the schema-single-source wave. Every test
/// runs against an EPHEMERAL postgres:16-alpine container started by Testcontainers;
/// migrations are applied with `dotnet ef database update --connection <container>`.
/// The developer/CI host database is never a target.
/// Tests skip gracefully when no Docker daemon or no dotnet-ef tool is available.
/// </summary>
public sealed class SchemaMigrationsIntegrationTests
{
    private readonly ITestOutputHelper _output;

    public SchemaMigrationsIntegrationTests(ITestOutputHelper output) => _output = output;

    // ---- Task 2.3: backfill matches trimmed + case-insensitively, orphans stay NULL ----

    [SkippableFact]
    [Trait("Category", "Schema")]
    public async Task M2Backfill_AssignsMatchedOwners_KeepsOrphansNull_AndSetNullFkHolds()
    {
        await SkipUnlessRuntimeAvailableAsync();

        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var conn = postgres.GetConnectionString();

        // Apply everything up to and including M1: the schema now has reservas and
        // usuarios, but reservas.usuario_id does not exist yet — exactly the state
        // the backfill must operate on.
        await EfCli.DatabaseUpdateAsync(EfCli.M1AbsorbDrift, conn);

        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            // Minimal referential chain plus pre-existing reservations, one of which
            // matches a user only after trimming and case folding.
            await db.ExecuteAsync("""
                INSERT INTO departamentos (nombre) VALUES ('Dpto Test');
                INSERT INTO municipios (departamento_id, nombre) VALUES (1, 'Mun Test');
                INSERT INTO categorias (nombre) VALUES ('Cat Test');
                INSERT INTO anfitriones (municipio_id, nombre, email)
                    VALUES (1, 'Host', 'host@test.local');
                INSERT INTO publicaciones (anfitrion_id, categoria_id, titulo, precio_por_noche, capacidad_maxima)
                    VALUES (1, 1, 'Pub', 10.00, 2);
                INSERT INTO usuarios (nombre, apellido, email, password_hash)
                    VALUES ('Ana', 'Garcia', ' ana.garcia@email.com ', 'not-a-real-hash');
                INSERT INTO reservas
                    (publicacion_id, nombre_huesped, email_huesped, fecha_inicio, fecha_fin, numero_huespedes, precio_total)
                VALUES
                    (1, 'Ana', ' ANA.GARCIA@EMAIL.COM ', '2026-01-05', '2026-01-08', 1, 30.00),
                    (1, 'Ghost', 'ghost@nowhere.example', '2026-02-01', '2026-02-02', 1, 10.00);
                """);
        }

        // Applying the latest migration (M2) adds usuario_id and backfills it.
        await EfCli.DatabaseUpdateAsync(targetMigration: null, conn);

        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            var matchedOwnerId = await db.ScalarAsync<int?>("""
                SELECT r.usuario_id FROM reservas r
                WHERE lower(btrim(r.email_huesped)) = 'ana.garcia@email.com';
                """);
            var userId = await db.ScalarAsync<int>("""
                SELECT id FROM usuarios WHERE lower(btrim(email)) = 'ana.garcia@email.com';
                """);
            Assert.Equal(userId, matchedOwnerId);

            var orphanNull = await db.ScalarAsync<int?>("""
                SELECT usuario_id FROM reservas WHERE email_huesped = 'ghost@nowhere.example';
                """);
            var orphanPreserved = await db.ScalarAsync<long>(
                "SELECT count(*) FROM reservas WHERE email_huesped = 'ghost@nowhere.example';");
            Assert.Equal(1, orphanPreserved);
            Assert.Null(orphanNull);

            var fkCount = await db.ScalarAsync<long>(
                "SELECT count(*) FROM pg_constraint WHERE conname = 'reservas_usuario_id_fkey';");
            Assert.Equal(1, fkCount);
        }

        // The FK is real and ON DELETE SET NULL: removing the user nulls the
        // ownership link without deleting or cascading the reservation.
        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            await db.ExecuteAsync("DELETE FROM usuarios;");

            var matchedAfterUserGone = await db.ScalarAsync<int?>(
                "SELECT usuario_id FROM reservas WHERE lower(btrim(email_huesped)) = 'ana.garcia@email.com';");
            Assert.Null(matchedAfterUserGone);

            var reservationsLeft = await db.ScalarAsync<long>("SELECT count(*) FROM reservas;");
            Assert.Equal(2, reservationsLeft);
        }
    }

    // ---- Spec: empty DB -> current via `ef database update`; idempotent seed; Down ----

    [SkippableFact]
    [Trait("Category", "Schema")]
    public async Task EmptyDatabase_ToCurrent_PopulatesHistory_SeedIsIdempotent_AndDownRollsBackDrift()
    {
        await SkipUnlessRuntimeAvailableAsync();

        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var conn = postgres.GetConnectionString();

        await EfCli.DatabaseUpdateAsync(targetMigration: null, conn);

        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            var applied = await db.ScalarAsync<long>(
                "SELECT count(*) FROM \"__EFMigrationsHistory\";");
            Assert.Equal(6, applied);

            // Drift columns + ownership column now exist from migrations alone.
            var hasColumns = await db.ScalarAsync<long>("""
                SELECT count(*) FROM information_schema.columns
                WHERE (table_name, column_name) IN
                  (('horarios','fecha'), ('reservas','metodo_pago'),
                   ('reservas','fecha_pago'), ('reservas','id_transaccion'),
                   ('reservas','usuario_id'));
                """);
            Assert.Equal(5, hasColumns);
        }

        // Seed after migrate, run twice: must load reference data once and be idempotent.
        var seedSql = await File.ReadAllTextAsync(Path.Combine(EfCli.RepoRoot, "database", "seed.sql"));
        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();
            await db.ExecuteAsync(seedSql);
            await db.ExecuteAsync(seedSql);

            var departments = await db.ScalarAsync<long>("SELECT count(*) FROM departamentos;");
            Assert.Equal(14, departments);
            var users = await db.ScalarAsync<long>("SELECT count(*) FROM usuarios;");
            Assert.Equal(0, users);
        }

        // Reversibility: rolling back to the pre-W2 migration removes the absorbed
        // drift and ownership structures, but keeps the underlying tables intact.
        await EfCli.DatabaseUpdateAsync(EfCli.LastPreW2Migration, conn);

        await using (var db = new NpgsqlConnection(conn))
        {
            await db.OpenAsync();

            var driftLeft = await db.ScalarAsync<long>("""
                SELECT count(*) FROM information_schema.columns
                WHERE (table_name, column_name) IN
                  (('horarios','fecha'), ('reservas','metodo_pago'),
                   ('reservas','fecha_pago'), ('reservas','id_transaccion'),
                   ('reservas','usuario_id'));
                """);
            Assert.Equal(0, driftLeft);

            var reservasIntact = await db.ScalarAsync<long>(
                "SELECT count(*) FROM reservas;");
            Assert.True(reservasIntact >= 3,
                "Earlier tables and their rows must survive the drift Down migration.");

            // M1.Down restores the historical (fake) gist indexes; M2 never made it in.
            var historyRows = await db.ScalarAsync<long>(
                "SELECT count(*) FROM \"__EFMigrationsHistory\";");
            Assert.Equal(4, historyRows);
        }
    }

    private static async Task SkipUnlessRuntimeAvailableAsync()
    {
        if (!await EfCli.DockerAvailableAsync())
        {
            Skip.If(true, "Docker daemon is not available: schema integration tests require Testcontainers.");
        }

        if (!await EfCli.EfToolAvailableAsync())
        {
            Skip.If(true, "The dotnet-ef global tool is not installed (dotnet tool install --global dotnet-ef --version 10.0.11).");
        }
    }
}

/// <summary>Small ADO helpers so the tests stay readable.</summary>
internal static class NpgsqlTestExtensions
{
    public static async Task ExecuteAsync(this NpgsqlConnection db, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, db);
        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task<T> ScalarAsync<T>(this NpgsqlConnection db, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, db);
        var value = await cmd.ExecuteScalarAsync();
        if (value is null or DBNull)
        {
            // For nullable scalar reads (e.g. a NULL usuario_id) return default.
            if (Nullable.GetUnderlyingType(typeof(T)) is not null || !typeof(T).IsValueType)
            {
                return default!;
            }

            throw new InvalidOperationException($"Expected a scalar of type {typeof(T)} but the query returned NULL.");
        }

        var target = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
        return (T)Convert.ChangeType(value, target);
    }
}
