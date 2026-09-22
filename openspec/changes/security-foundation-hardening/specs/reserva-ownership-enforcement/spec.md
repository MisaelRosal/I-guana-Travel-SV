# reserva-ownership-enforcement Specification

## Purpose

Server-side reservation integrity: bind the DTO, run the validator, recompute price, derive owner from the token, scope reads to the caller, and close IDORs. Realizes part of proposal capability `reservation-integrity`. Traces: explore Axis-3 (client submits entity+price, dead validator, all-rows leak, IDOR), decision D4 (usuario_id FK), corrections (recompute price, close mass-assignment/IDOR).

## Requirements

### Requirement: DTO binding and live validator

`POST /api/reserva` and `PUT /api/reserva/{id}` MUST bind `CreateReservaDto` (not the `Reserva` entity) so `CreateReservaValidator` runs. Invalid DTOs MUST be rejected with `400` before persistence.

Traces: explore Axis-3 (dead validator) · proposal reservation-integrity

#### Scenario: Invalid guest email rejected

- GIVEN an authenticated caller
- WHEN `POST /api/reserva` with an invalid `EmailHuesped`
- THEN `CreateReservaValidator` rejects it and the API returns `400` without persisting

### Requirement: Server-side price recompute

The system MUST compute `PrecioTotal` server-side from the authoritative publication data (lodging: `precio_por_noche` × nights in `[fecha_inicio, fecha_fin]`; experience: from the booked `horario`/`experiencia` price) and MUST ignore any client-supplied `PrecioTotal`.

Traces: explore Axis-3 (persist client price L123/L168) · correction recompute · proposal reservation-integrity

#### Scenario: Client lowballs the price

- GIVEN a lodging publication priced at 100/night
- WHEN an authenticated caller posts a reservation for 3 nights with body `PrecioTotal = 0.01`
- THEN the persisted `PrecioTotal` MUST be 300, not 0.01

### Requirement: Owner derived from token

The `usuario_id` of a new reservation MUST be set from the authenticated token's `sub`; the client MUST NOT be able to supply or override it via the body.

Traces: decision D4 (usuario_id) · correction (close mass-assignment) · proposal reservation-integrity

#### Scenario: Body UsuarioId ignored

- GIVEN an authenticated caller `sub=7`
- WHEN it posts a reservation whose body carries `UsuarioId=99`
- THEN the stored reservation's `usuario_id` MUST be 7

### Requirement: Owner-scoped reads

`GET /api/reserva` MUST return only reservations whose `usuario_id` equals the caller's `sub`; an `admin` MAY see all. Reservations with `usuario_id = NULL` (orphans from backfill) MUST NOT be returned to any non-admin user. `GET /api/reserva/{id}` MUST behave the same for a single row.

Traces: explore Axis-3 (all rows = PII leak) · proposal reservation-integrity

#### Scenario: Caller sees only own rows

- GIVEN user 7 and user 8 each own reservations
- WHEN user 7 calls `GET /api/reserva`
- THEN only user 7's rows are returned

#### Scenario: Orphan row hidden from owners

- GIVEN a reservation with `usuario_id = NULL`
- WHEN any non-admin user lists reservations
- THEN that row MUST NOT appear (admins may)

### Requirement: IDOR closure on reservation mutations

`PUT /api/reserva/{id}`, `DELETE /api/reserva/{id}`, and the `confirmar`/`pagar`/`cancelar` actions MUST verify the target reservation belongs to the caller's `sub` (or the caller is `admin`); otherwise `403` (or `404` to avoid existence leak).

Traces: explore Axis-3 (mutate by id, no owner check) · proposal reservation-integrity

#### Scenario: Cancel another user's reservation

- GIVEN user 8 authenticated
- WHEN it calls `PUT /api/reserva/{id}/cancelar` on user 7's reservation
- THEN the API MUST respond `403` (or `404`) and leave the row unchanged
