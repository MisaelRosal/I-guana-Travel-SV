using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IguanaSV.Api.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// M3 (wave W5, design TD2 + TD3, open-decision OD-1): replaces the racy
    /// application-level overlap check with a real database exclusion constraint
    /// and adds the experience-slot hygiene index.
    ///
    /// All statements are raw SQL on purpose: EF Core's Npgsql provider has no
    /// exclusion-constraint API, so the <c>EXCLUDE USING gist</c> cannot be
    /// expressed through the model. The constraint therefore lives ONLY here and
    /// is deliberately kept out of <c>IguanasDbContext</c>; the fake plain-GiST
    /// "no overlap" indexes stay deleted (they enforced nothing) and are not
    /// re-added to the model, which keeps <c>has-pending-model-changes</c> green.
    ///
    /// The whole migration runs inside the default EF transaction (PostgreSQL
    /// DDL is transactional), so the pre-clean and the constraint creation are
    /// atomic: the constraint can never be validated against the very rows the
    /// pre-clean was meant to normalize.
    /// </summary>
    public partial class ReplaceRacyIndexesWithExclusions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // (OD-1 / TD3) Pre-clean before creating the exclusion. An
            // experience reservation is modelled as a single point in time
            // (fecha_fin := fecha_inicio), so daterange(fecha_inicio, fecha_fin,
            // '[)') is the EMPTY range, which overlaps nothing and the row
            // self-exempts from the lodging EXCLUDE without a cross-table
            // predicate (an EXCLUDE cannot join publicaciones.tipo). A legacy
            // experience row stored with fecha_fin > fecha_inicio would present a
            // non-empty range and could falsely collide with another row on the
            // same publication, so we collapse it here. Design TD3 is the source
            // of this rule.
            //
            // DATA-SAFETY NOTE: this UPDATE narrows existing experience ranges; it
            // does not delete rows. On a clean / test database it is a no-op. The
            // "is experience" test joins publicaciones by tipo = 'experiencia'
            // (the schema's own discriminator).
            migrationBuilder.Sql("""
                UPDATE reservas r
                SET fecha_fin = r.fecha_inicio
                FROM publicaciones p
                WHERE r.publicacion_id = p.id
                  AND lower(btrim(p.tipo)) = 'experiencia'
                  AND r.fecha_fin > r.fecha_inicio;
                """);

            // Defensive cleanup of the historical fake GiST indexes. M1 already
            // dropped them, so these are normally no-ops; IF EXISTS keeps the
            // statement safe regardless of the starting state, and we never
            // recreate them (they enforced nothing).
            migrationBuilder.Sql("DROP INDEX IF EXISTS reservas_no_overlap;");
            migrationBuilder.Sql("DROP INDEX IF EXISTS horarios_no_overlap;");

            // (TD2) The real no-double-booking rule for lodging: two active
            // reservations for the same publication must not have overlapping
            // half-open [check-in, check-out) ranges, so a checkout day and the
            // next check-in day can coincide. Cancelled rows are excluded via the
            // partial predicate (NULL estado is DISTINCT FROM 'cancelada', so it
            // still participates). btree_gist (already enabled) supplies the
            // integer equality opclass for publicacion_id WITH =.
            migrationBuilder.Sql("""
                ALTER TABLE reservas
                    ADD CONSTRAINT reservas_no_overlap_lodging
                    EXCLUDE USING gist (
                        publicacion_id WITH =,
                        daterange(fecha_inicio, fecha_fin, '[)') WITH &&
                    )
                    WHERE (estado IS DISTINCT FROM 'cancelada');
                """);

            // (TD3) Slot hygiene for experience bookings: a plain btree over the
            // dated-slot lookup columns. Non-unique on purpose: capacity is
            // enforced in the application under a per-slot advisory lock, not by
            // this index, so a host may legitimately publish the same window on
            // different rows. Kept out of the EF model as raw DDL.
            migrationBuilder.Sql("""
                CREATE INDEX IF NOT EXISTS idx_horarios_fecha_slot
                    ON horarios (publicacion_id, fecha, hora_inicio, hora_fin)
                    WHERE fecha IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop the exclusion constraint and the hygiene index, returning the
            // schema to the exact state left by M2. The historical fake GiST
            // indexes are deliberately NOT recreated here: restoring them is the
            // job of M1's Down, and recreating them would double-register objects
            // that enforce nothing.
            migrationBuilder.Sql("ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_no_overlap_lodging;");
            migrationBuilder.Sql("DROP INDEX IF EXISTS idx_horarios_fecha_slot;");

            // NOTE: the OD-1/TD3 pre-clean collapsed experience rows' fecha_fin
            // onto fecha_inicio. That original end date is not stored anywhere, so
            // Down cannot restore it. This is acceptable for the ephemeral test
            // databases this migration is exercised against (and a no-op there,
            // since the pre-clean runs on empty tables); a production rollback
            // would need a data backup taken before Up.
        }
    }
}
