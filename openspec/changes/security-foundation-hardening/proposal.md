# Proposal: Security & Foundations Hardening

> Canonical: `security-foundation-hardening` · display "seguridad-y-cimientos". Source of truth: `exploration.md` / Engram obs #15. Greenfield auth (no token exists today).

## Intent
The app has **no authentication or authorization**: every endpoint is anonymous, clients submit prices and roles, secrets are committed, CI is falsely green (empty `.sln`), the schema has three sources of truth, uploads/CORS/double-booking are exploitable, and there are zero tests. This change builds a security and data-integrity foundation without adding product features.

## Scope
### In Scope
- **AuthN** — short-lived JWT in **HttpOnly, SameSite cookie** + CSRF (`AllowCredentials`); login/register issue it, logout clears. *(overrides explore's sessionStorage rec — confirmed D2)*
- **AuthZ** — `[Authorize]` + role/ownership matrix; move role gates from front to server.
- **Server-side enforcement** — bind `CreateReservaDto`, run validator, **recompute `PrecioTotal`**, owner-scoped queries, close `UsuarioId` mass-assignment + IDORs.
- **Data model** — add `reservas.usuario_id` FK + email backfill; `EXCLUDE USING gist` no-double-booking.
- **Schema** — EF migrations = single source of truth; `init.sql` → seed only; generate drift migration; Docker runs `ef database update`.
- **Secrets/config** — purge committed creds → user-secrets/`.env`; unify DB name/port; align Vite proxy + launchSettings; fix `.sln` + CI.
- **Hardening** — CORS origin allowlist; magic-byte + size upload validation, gated write/delete, `Content-Disposition`; bucket keeps public read, gates write.
- **Tests** — xUnit + WebApplicationFactory + Testcontainers (backend), Vitest (frontend), wired to CI.

### Out of Scope (follow-ups)
- Real payment gateway (stays simulated) · notifications · reviews · Nominatim map · refresh tokens/rotation.

## Capabilities
### New Capabilities
- `api-authn`: JWT cookie session (issue/verify/logout) + CSRF protection.
- `api-authz`: endpoint role/ownership matrix, enforced server-side.
- `reservation-integrity`: DTO binding, server price recompute, owner scoping, `usuario_id` FK + backfill, EXCLUDE no-overlap.
- `schema-migrations`: EF migrations as source of truth; seed-only `init.sql`.
- `config-and-secrets`: secret externalization, unified config, buildable `.sln`/CI.
- `upload-and-cors`: magic-byte/size-safe uploads + CORS allowlist with credentials.
- `test-foundation`: backend + frontend test harnesses wired to CI.

### Modified Capabilities
- None (`openspec/specs/` empty — greenfield).

## Approach
Seven **dependency waves**, each a **chained PR under 400 lines**: W1 build/secrets/config → W2 schema+migration → W3 AuthN+AuthZ → W4 enforcement+ownership → W5 EXCLUDE → W6 CORS/uploads → W7 test slices (enabled from W1). Order: auth→authz, schema→FK/constraints, `.sln`/CI→tests. Store hybrid, delivery `ask-on-risk`: orchestrator consults the human before any wave whose forecast exceeds the budget.

## Affected Areas
| Area | Impact |
|---|---|
| `Program.cs` | authn/authz wiring, CORS allowlist |
| `Controllers/AuthController.cs` | issue/verify JWT cookie, CSRF |
| `Controllers/{Reserva,Anfitrione,Publicacione,Imagenes}Controller.cs` | `[Authorize]`, DTO bind, role/owner gates |
| `Entities/Reserva.cs`, `IguanasDbContext.cs`, `Migrations/*` | `usuario_id` FK, EXCLUDE, drift migration |
| `Validators/CreateReservaValidator.cs` | made live via DTO binding |
| `appsettings.json`, `.env.example`, `docker-compose.yml`, `run-migrations.sh` | secrets out, config unified |
| `IguanaSV.Api.sln`, `.github/workflows/pr-validation.yml` | buildable, real CI |
| `Frontend/src/**` (`api.js`, admin/host gates) | cookie/CSRF, drop client-side authz |
| `Backend/IguanaSV.Api.Tests`, `Frontend` Vitest | new |

## Risks
| Risk | L | Mitigation |
|---|---|---|
| Backfill orphan reservas (email→user) | Med | spec fixes null-vs-reject; reversible migration |
| Docker startup collision (init.sql vs ef update) | Med | demote init.sql to seed + ordered entrypoint |
| Cookie+CSRF breaks existing SPA fetches | Med | AllowCredentials+SameSite+CSRF, covered in W3/W7 |
| Cumulative scope > 400-line PRs | High | 7 chained waves; ask-on-risk gate |
| Config blast radius | Low | env-var driven; per-file checklist |

## Rollback Plan
Each wave is a separate PR → revert per PR. FK+backfill and EXCLUDE ship as reversible `Up`/`Down` migration pairs. `init.sql` seed stays idempotent; reverting `run-migrations.sh` restores prior startup. Committed creds are rotated regardless of rollback. Revert `.sln`/CI to prior build target if tests misbehave. No data-destructive step.

## Dependencies
EF Core 10 tooling; `btree_gist` (already enabled); Docker-capable CI runner. No new external services.

## Success Criteria
- [ ] 0 anonymous mutations on protected routes; role/ownership enforced server-side.
- [ ] Client `PrecioTotal`/`UsuarioId`/`Rol` ignored; prices recomputed server-side.
- [ ] `GET /Reserva` returns only caller's rows (PII leak closed).
- [ ] No committed secrets in tracked files; config uses env/user-secrets.
- [ ] `dotnet build .sln` compiles the API; CI runs real tests (no "se omite").
- [ ] Migrations build the DB from empty + seed; `init.sql` seed-only.
- [ ] Concurrent double-booking rejected by `EXCLUDE`.
- [ ] Backend+frontend suites green in CI covering authn, ownership, price recompute, admin-only verificacion, EXCLUDE.
