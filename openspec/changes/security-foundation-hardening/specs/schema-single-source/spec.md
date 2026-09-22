# schema-single-source Specification

## Purpose

EF migrations become the single source of truth; `init.sql` is demoted to idempotent seed; Docker applies migrations; schema drift (pago columns, `horarios.fecha`, `reservas.usuario_id`, EXCLUDE) is absorbed by reversible migrations. Realizes proposal capability `schema-migrations`. Traces: explore Axis-5 (three sources of truth, stale migrations, incompatible `run-migrations.sh`), decision D1, open-point-1 (backfill).

## Requirements

### Requirement: Migrations reconstruct the full schema

`dotnet ef database update` from an empty database MUST create the complete schema (all tables, columns, FKs, the `reservas.usuario_id` FK, and the EXCLUDE constraints) and MUST populate `__EFMigrationsHistory`.

Traces: explore Axis-5 · decision D1 · proposal schema-migrations

#### Scenario: Empty DB to current

- GIVEN an empty PostgreSQL database
- WHEN migrations are applied
- THEN the current schema exists and `__EFMigrationsHistory` contains the applied migration ids

### Requirement: Drift absorbed into migrations

Columns previously hand-patched (`reservas.metodo_pago/fecha_pago/id_transaccion`, `horarios.fecha`) MUST be defined by migrations; the model snapshot MUST match the migrations; the standalone `add_*.sql` patch scripts MUST be retired as schema sources.

Traces: explore Axis-5 · decision D1 · proposal schema-migrations

#### Scenario: No hand-patch needed

- GIVEN a freshly migrated database
- WHEN queried for `reservas.id_transaccion` and `horarios.fecha`
- THEN both columns exist without running any `add_*.sql`

### Requirement: init.sql reduced to seed only

`database/init.sql` MUST contain only idempotent seed `INSERT`s (reference data) and MUST NOT define tables (`CREATE TABLE`). Seed MUST be runnable after migrations and MUST be idempotent on re-run.

Traces: explore Axis-5 · decision D1 · proposal schema-migrations

#### Scenario: Seed after migrate is idempotent

- GIVEN a migrated database
- WHEN the seed is applied twice
- THEN reference rows are present exactly once and no table DDL is executed

### Requirement: Docker starts with migrations applied

The Docker startup sequence MUST run `dotnet ef database update` (ordered after the DB is healthy and before/around seeding) so containers come up with the migration-built schema; a naive collision between `init.sql` DDL and `ef database update` MUST NOT occur.

Traces: explore Axis-5 (run-migrations.sh incompatible) · decision D1 · proposal schema-migrations

#### Scenario: Compose brings up migrated DB

- GIVEN `docker compose up`
- WHEN the backend becomes healthy
- THEN the database reflects the migration-built schema and seed data

### Requirement: Drift migration is reversible

The migration(s) that absorb drift, add `reservas.usuario_id`, and add the EXCLUDE constraints MUST provide `Up`/`Down` such that `Down` restores the prior schema without data-destructive loss beyond the added structures.

Traces: explore risks (reversible migration) · proposal schema-migrations

#### Scenario: Roll back drift migration

- GIVEN migrations applied
- WHEN the latest drift `Down` runs
- THEN the added structures are removed and earlier tables remain intact

### Requirement: Reservations backfill keeps orphans as NULL

The `reservas.usuario_id` column MUST be added as NULLABLE. The migration MUST backfill `usuario_id` by matching `reservas.email_huesped` to `usuarios.email` (case-insensitive, trimmed). Rows whose email matches no user MUST be left `NULL` — they MUST NOT be deleted and MUST NOT block the migration.

Traces: open-point-1 (backfill orphans) · decision D4 · proposal schema-migrations

#### Scenario: Matching email backfilled

- GIVEN a reservation with `email_huesped` equal to an existing `usuarios.email`
- WHEN the backfill runs
- THEN `usuario_id` is set to that user's id

#### Scenario: Orphan email stays NULL

- GIVEN a reservation whose `email_huesped` matches no user
- WHEN the backfill runs
- THEN the migration completes successfully and the row's `usuario_id` remains `NULL` (row preserved)

#### Scenario: Orphans not owner-visible

- GIVEN at least one reservation with `usuario_id = NULL`
- WHEN a normal (non-admin) user lists their reservations
- THEN that orphan row is excluded from the result
