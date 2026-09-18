# ci-tests-green Specification

## Purpose

Make the build and CI real: a solution that actually compiles the API, a backend test project wired into CI, a frontend test runner, and smoke suites covering the security guarantees. Realizes proposal capability `test-foundation`. Traces: explore Axis-7 (empty `.sln` = vacuous green, "se omite" test step, accept-any-HTTP smoke).

## Requirements

### Requirement: Solution references the API and a test project

`Backend/IguanaSV.Api.sln` MUST reference the API project AND a backend test project so that `dotnet build IguanaSV.Api.sln` actually compiles the API (no longer vacuously green).

Traces: explore Axis-7 (sln declares zero projects) · proposal test-foundation

#### Scenario: Build compiles the API

- GIVEN the fixed `.sln`
- WHEN `dotnet build IguanaSV.Api.sln -c Release` runs in CI
- THEN the API project and test project compile (build fails if any source error)

### Requirement: CI runs real backend and frontend tests

CI MUST execute `dotnet test` against the backend test project (xUnit + `WebApplicationFactory` + Testcontainers-Postgres) and MUST execute `npm test` (Vitest) for the frontend. The current skip branch that prints "se omite" MUST be removed so an absent/failed suite is a hard failure.

Traces: explore Axis-7 (test step always skipped) · proposal test-foundation

#### Scenario: Failing suite turns CI red

- GIVEN a PR whose authz or ownership test fails
- WHEN CI runs
- THEN the backend test step MUST fail the job

### Requirement: Security smoke coverage

The test suites MUST include smoke coverage of: login → auth cookie → `/me`; protected reservation create recomputes `PrecioTotal`; `GET /api/reserva` returns only the caller's rows; host `verificacion` rejected for non-admin; `EXCLUDE` rejects a concurrent double-booking; magic-byte upload rejection.

Traces: explore Axis-7 + Axis-1/3/6 · proposal test-foundation

#### Scenario: Ownership smoke present

- GIVEN the backend test project
- WHEN the suite runs
- THEN an executed test asserts a non-owner reservation mutation returns `403`

### Requirement: Backend smoke asserts a real status

The Docker/compose backend smoke test MUST assert a concrete success status (e.g. `200` on a public read endpoint) instead of accepting any HTTP code.

Traces: explore Axis-7 (accept any HTTP code) · proposal test-foundation

#### Scenario: Smoke fails on error response

- GIVEN the backend returns `500` on the smoke endpoint
- WHEN the compose smoke test runs
- THEN the step MUST fail
