# secrets-config-hygiene Specification

## Purpose

No credentials in tracked files; unified configuration across local and Docker; Vite proxy and launchSettings point at the same API port. Realizes proposal capability `config-and-secrets`. Traces: explore Axis-4 (committed creds, 3-way port/DB divergence, Vite :5000 vs API :5100).

## Requirements

### Requirement: No secrets in tracked files

Tracked configuration (`appsettings.json`, `docker-compose.yml`, scripts) MUST NOT contain real database passwords, MinIO keys, or other secrets. Real values MUST be supplied via environment variables and/or `dotnet user-secrets` for non-Docker local dev. A committed `.env.example` MUST list every required variable name with non-secret placeholder values, while `.env` stays gitignored.

Traces: explore Axis-4 (Password=1234567890, minioadmin in appsettings) · proposal config-and-secrets

#### Scenario: Tracked config has no credential values

- GIVEN the repository tree
- WHEN a scan runs over tracked files
- THEN no real DB password or MinIO secret value is present in `appsettings.json`

#### Scenario: App reads config from environment

- GIVEN `ConnectionStrings__DefaultConnection` and `Minio__*` set via env/user-secrets
- WHEN the API starts
- THEN it connects using those values (not hard-coded ones)

### Requirement: Unified database name, password, and port

One canonical database name, user, and password MUST be used consistently by local dev and Docker (no `Iguana-SV`/`iguanaSV` or password divergence). All sources (`appsettings` via env, `.env`/`.env.example`, `docker-compose.yml`, migration connection) MUST resolve to the same values.

Traces: explore Axis-4 (DB/pass divergence) · proposal config-and-secrets

#### Scenario: Single DB identity across runtimes

- GIVEN the unified configuration
- WHEN both local `dotnet run` and `docker compose` connect
- THEN they target the same database name and credentials

### Requirement: Aligned local API port

The local API listen URL, the Vite `/api` proxy target, and the documented Docker host mapping MUST resolve to the same API base URL for local development, so one command starts a working stack (eliminating the `:5000` proxy vs `:5100` API mismatch).

Traces: explore Axis-4 (vite :5000 vs launchSettings :5100) · proposal config-and-secrets

#### Scenario: Proxy hits the running API

- GIVEN the SPA dev server and the local API are both started
- WHEN the SPA calls `/api/...`
- THEN the request reaches the running API (proxy target equals the API's bound port)

### Requirement: Secret-leak guard

The test suite MUST include an automated check that fails the build if a credential-like value appears in a tracked file, preventing regressions.

Traces: explore Axis-4 · proposal config-and-secrets

#### Scenario: Reintroduced secret fails CI

- GIVEN a PR that adds a literal password to a tracked config file
- WHEN the guard test runs
- THEN the test MUST fail
