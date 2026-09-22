# no-double-booking Specification

## Purpose

Database-enforced exclusion preventing overlapping active bookings, replacing the racy application-level `AnyAsync` check and the (currently plain GiST) indexes. Realizes part of proposal capability `reservation-integrity`. Traces: explore Axis-6 (GiST normal indexes, not EXCLUDE; race under concurrency), decision D5 (`EXCLUDE USING gist`, `btree_gist` already enabled).

## Requirements

### Requirement: Lodging overlap excluded at the database

The `reservas` table MUST enforce, via a PostgreSQL `EXCLUDE USING gist` constraint (with `btree_gist`), that two non-cancelled reservations for the same `publicacion_id` MUST NOT have overlapping `[fecha_inicio, fecha_fin]` ranges. Enforcement MUST be at the DB so it holds under concurrent inserts.

Traces: explore Axis-6 · decision D5 · proposal reservation-integrity

#### Scenario: Concurrent overlap rejected

- GIVEN one active reservation for publication P on 2026-05-01..2026-05-05
- WHEN a second committed reservation for P on 2026-05-03..2026-05-07 is attempted
- THEN the database MUST reject it (exclusion violation)

#### Scenario: Cancelled reservation does not block

- GIVEN a reservation for P on 2026-05-01..2026-05-05 with `estado='cancelada'`
- WHEN a new active reservation for the same range is created
- THEN it MUST be allowed (cancelled rows excluded from the constraint)

#### Scenario: Adjacent range allowed

- GIVEN an active reservation ending on 2026-05-05
- WHEN a new reservation starts on 2026-05-05 (checkout/checkin boundary rule per policy)
- THEN the boundary MUST be consistent and non-overlapping as defined by the range operator

### Requirement: Experience slot overlap excluded

For experience publications booked to a concrete `horario` (date/slot), the system MUST prevent double-booking the same `horario_id` (or same `publicacion_id` + `fecha`) beyond capacity via the same exclusion mechanism.

Traces: explore Axis-6 (horarios_no_overlap) · decision D5 · proposal reservation-integrity

#### Scenario: Double-book the same slot

- GIVEN a `horario` H already taken for a reservation
- WHEN a conflicting reservation attempts to occupy the same slot/capacity
- THEN the database MUST reject the overlap

### Requirement: Overlap surfaces as HTTP 409

When a reservation create/update fails because of the exclusion constraint, the API MUST map the violation to `409 Conflict` (not a 500).

Traces: decision D5 · proposal reservation-integrity

#### Scenario: API returns conflict

- GIVEN an active reservation blocking the requested dates
- WHEN a caller posts an overlapping reservation
- THEN the API MUST return `409`

### Requirement: Exclusion shipped as reversible migration

The `EXCLUDE USING gist` constraint MUST be created by an EF migration whose `Down` drops it, so the change is reversible.

Traces: decision D5 · proposal schema-migrations

#### Scenario: Migration rollback

- GIVEN the migration applied
- WHEN `Down` runs
- THEN the exclusion constraint is removed and prior DDL state is restored
