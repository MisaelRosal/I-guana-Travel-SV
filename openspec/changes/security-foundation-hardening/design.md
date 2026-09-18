# Design: security-foundation-hardening ("seguridad-y-cimientos")

> Satisfies 38 requirements / 53 scenarios across the 8 delta specs in `specs/*/spec.md` (Engram obs #18). Contract decisions D1–D5 are inputs, not re-opened. This design closes the 6 technical open points.

## Context

ASP.NET Core 10 Minimal-API-style `Program.cs` has **no auth pipeline** (only CORS `AllowAnyOrigin` + controllers + DbContext + MinIO). `AuthController` BCrypt-verifies but issues **no token**. `ReservaController` binds the `Reserva` entity directly, persists client `PrecioTotal`, returns all rows, and its `AnyAsync` overlap check is racy. `IguanasDbContext` already declares `HasPostgresExtension("btree_gist")` and two **plain GiST indexes** (`reservas_no_overlap`, `horarios_no_overlap`, L540–548) that are not EXCLUDEs. Schema is 3-way divergent (init.sql vs 4 stale migrations vs `add_*.sql`). Ports: launchSettings `:5100` vs Vite proxy/docker `:5000`. `.sln` has zero projects; CI skips tests ("se omite"). Frontend `api.js` calls `/api` through the Vite proxy (same-origin); role is read from `sessionStorage.iguana_usuario`.

## Goals / Non-goals

**Goals**: implement the 8 capabilities under the fixed 400-line PR policy, DB-enforced integrity, reversible migrations, real CI.
**Non-goals**: refresh tokens, real payments, presigned URLs, notification/review features, UI redesign.

## Architecture per capability

| Capability (spec) | Where it lands | Key files |
|---|---|---|
| authn-jwt-cookie | `AddAuthentication().AddJwtBearer` with cookie `TokenRetriever`; `AuthController` issues/clears cookies; custom CSRF middleware; CORS policy from config | `Program.cs`, `Controllers/AuthController.cs`, new `Middleware/CsrfMiddleware.cs`, `DTOs/AuthDtos.cs` |
| authz-roles-ownership | `[Authorize]` on all mutating actions; `[Authorize(Roles="admin")]` on verificacion/role paths; owner checks in controllers from `sub` | `Controllers/{Anfitrione,Publicacione,Imagenes,Reserva}Controller.cs` |
| reserva-ownership-enforcement | bind `CreateReservaDto` (validator finally runs), server price recompute, `usuario_id` from token, owner-scoped `GET` | `Controllers/ReservaController.cs`, `Models/CreateReservaDto.cs`, `Validators/CreateReservaValidator.cs`, `Entities/Reserva.cs` (+`UsuarioId`) |
| no-double-booking | EXCLUDE migration + `23P01→409` mapping + advisory-lock slot check | new migration, `ReservaController.cs` |
| schema-single-source | 3 new reversible migrations; `init.sql`→guarded `seed.sql`; Docker `migrator` service | `Migrations/*`, `database/seed.sql`, `docker-compose.yml`, `run-migrations.sh` (retired) |
| secrets-config-hygiene | env/user-secrets only; unified names + port 5000; `.env.example`; secret-leak guard test | `appsettings.json`, `launchSettings.json`, `docker-compose.yml`, `.env.example` |
| upload-hardening | magic-byte sniffer, size cap, `Content-Disposition`, auth gates (CORS lives in authn spec) | `Controllers/ImagenesController.cs`, `Services/MinioStorageService.cs` |
| ci-tests-green | `.sln` = API + `IguanaSV.Api.Tests`; CI runs `dotnet test` + `npm test`; smoke asserts 200 | `Backend/IguanaSV.Api.sln`, `.github/workflows/pr-validation.yml`, new test project |

## Technical decisions (ADR style)

### TD1 — Unified dev port: **:5000**
**Choice**: canonical local API port **5000** (`API_PORT=5000` documented in `.env.example` as the single source-of-truth value). Map: `launchSettings.json` → `applicationUrl: "http://localhost:5000"` (http profile; https profile keeps 7285); Vite proxy **stays** `http://localhost:5000` (zero change); docker-compose **stays** `5000:8080` (container-internal port unchanged); CORS dev allowlist includes `http://localhost:5000`. A CI guard test greps the three files for `5000` consistency.
**Alternatives**: unify on `:5100` — touches Vite proxy, docker host mapping, CI smoke URL, and docs (larger blast radius). Env-var indirection in launchSettings — not supported reliably there.
**Rationale**: two of the three consumers (Vite, compose, CI smoke) already use 5000; one file changes. Tradeoff: local `dotnet run` and docker backend can't run simultaneously — documented; `--urls http://localhost:5101` for the rare parallel case.
Satisfies `secrets-config-hygiene` R "Aligned local API port".

### TD2 — Lodging range: **half-open `[checkin, checkout)`**
**Choice**: hotel standard — checkout day is free. Constraint (btree_gist already enabled):
```sql
ALTER TABLE reservas ADD CONSTRAINT reservas_no_overlap_lodging
EXCLUDE USING gist (
  publicacion_id WITH =,
  daterange(fecha_inicio, fecha_fin, '[)') WITH &&
) WHERE (estado IS DISTINCT FROM 'cancelada');
```
App-level pre-check uses the matching predicate `r.FechaInicio < new.FechaFin AND r.FechaFin > new.FechaInicio` (fixes today's inclusive `<=`/`>=`). Lodging requires `fecha_fin > fecha_inicio` (≥1 night). Adjacency (`A.fin == B.inicio`) yields disjoint `[)` ranges → allowed, per spec scenario.
**Alternatives**: closed `[ ]` — rejects legitimate same-day checkout/checkin, breaks the "Adjacent range allowed" scenario.
This is the bridge to TD3: an experience reservation is stored with `fecha_fin := fecha_inicio` → `daterange(x,x,'[)')` is the **empty range**, which never `&&` anything, so experiences self-exempt from the EXCLUDE without a cross-table predicate (EXCLUDEs cannot join `publicaciones.tipo`).

### TD3 — Experience capacity: **per-slot count under advisory lock, not EXCLUDE**
**Choice**: slots are `horarios` rows (`fecha` + hour window); occupancy links `reserva_horario`. Count-based capacity cannot be expressed as an EXCLUDE. Mechanism: inside the create transaction, take `pg_advisory_xact_lock(horario_id)`, then verify `SUM(numero_huespedes)` over active (non-`cancelada`) reservations joined through `reserva_horario` for that `horario_id`, plus the new request, is ≤ `publicaciones.capacidad_maxima`; violation → `409`. The lock serializes concurrent inserts, closing the `AnyAsync` race the spec traces. Also: drop the fake `horarios_no_overlap`/`reservas_no_overlap` GiST indexes and add btree `horarios(publicacion_id, fecha, hora_inicio, hora_fin) WHERE fecha IS NOT NULL` (slot hygiene).
**Alternatives**: per-seat rows table + unique index (schema explosion); `UNIQUE(horario_id)` partial EXCLUDE (caps at 1, wrong when capacity >1); SERIALIZABLE retries (deferral errors surface as 500s — worse UX than an xlock).
Satisfies `no-double-booking` R "Experience slot overlap excluded" (DB-enforced via lock + constraint-backed state).

### TD4 — Auth flow: JWT read from cookie + double-submit CSRF
```
POST /api/auth/login ─ server verifies BCrypt ─ signs JWT{sub,rol,exp}
  ← Set-Cookie iguana_auth=<jwt>   HttpOnly, SameSite=Lax, Path=/, Secure in prod
  ← Set-Cookie iguana_csrf=<rand>  HttpOnly=false (SPA-readable); body: user info, NO token
SPA mutations: fetch(credentials default same-origin) + header X-CSRF-Token: <iguana_csrf cookie>
Pipeline: UseAuthentication → CsrfMiddleware → UseAuthorization → MapControllers
CsrfMiddleware: non-GET + authenticated + not(login|register) → X-CSRF-Token must equal
  iguana_csrf cookie (constant-time); missing/mismatch → 400. GET exempt.
JwtBearer: options.TokenRetriever = ctx => ctx.Request.Cookies["iguana_auth"];
  Events.OnMessageReceived also accepts Authorization: Bearer (Swagger/dev/tests fallback).
  RoleClaimType="rol", NameClaimType="sub"; keys/audience from Jwt:* config (user-secrets/env).
/me [Authorize]: rehydrates from DB (fresh rol); logout POST clears both cookies (expires).
Ownership: sub→int id in controllers; publication owner = Anfitriones.UsuarioId == sub
  (queried from DB, not claim — role upgrades apply immediately); admin gate = claim.
```
Frontend: `api.js` gains a `csrf()` helper + auto header on POST/PUT/PATCH/DELETE; `sessionStorage` role reads replaced by `GET /api/auth/me` as source of truth.
**Alternatives**: `AddCookie` identity (no stateless JWT, D2 mandates JWT); refresh rotation (D3 out).
Satisfies `authn-jwt-cookie` (all 5 requirements) and `authz-roles-ownership` read/write split.

### TD5 — Migration plan (3 new, strictly ordered, all reversible)
- **M1 `AbsorbPendingSchemaDrift`** — `dotnet ef migrations add` diff: `horarios.fecha` (date), `reservas.metodo_pago/fecha_pago/id_transaccion`. Down drops them (structural reversibility; additive today).
- **M2 `AddReservaUsuarioOwnership`** — `reservas.usuario_id` INT **NULL** + FK → `usuarios.id ON DELETE SET NULL` + `idx_reservas_usuario`; backfill `UPDATE reservas r SET usuario_id = u.id FROM usuarios u WHERE lower(btrim(r.email_huesped)) = lower(btrim(u.email))` (usuarios.email is unique → no fan-out); non-matches stay NULL (spec: orphans preserved). Down: drop index, constraint, column.
- **M3 `ReplaceRacyIndexesWithExclusions`** — raw SQL (Npgsql/EF has no exclusion-constraint API): Up pre-cleans experience rows (`SET fecha_fin = fecha_inicio WHERE tipo='experiencia'` join), drops both fake GiST indexes, adds TD2 EXCLUDE + TD3 btree unique. Down restores prior indexes, drops EXCLUDE.
- **Model discipline**: delete the two `HasMethod("gist")` stubs in `IguanasDbContext.cs` (L540–548) and exclude the EXCLUDE from the model; CI runs `dotnet ef migrations has-pending-model-changes` to prove no drift.
- **Docker/`__EFMigrationsHistory`**: new one-shot `migrator` service (sdk:10.0 + `dotnet-ef` + psql): waits `postgres` healthy → `dotnet ef database update` (populates history itself) → `psql -v ON_ERROR_STOP=1 -f /sql/seed.sql`. `backend` gets `depends_on: migrator: condition: service_completed_successfully`. `init.sql` → `database/seed.sql`: DDL stripped, INSERTs wrapped in existence guards → idempotent; postgres `initdb.d` mount removed (kills the naive-collision risk). `run-migrations.sh` and `add_*.sql` retired/deleted.
Satisfies all 8 `schema-single-source` requirements.

### TD6 — Capability → archive mapping
All 8 spec folders archive **as-is** into `openspec/specs/` (greenfield; no merges). Proposal names are display aliases: `api-authn`→**authn-jwt-cookie** (absorbs CORS, uploads-side excluded), `api-authz`→**authz-roles-ownership**, `reservation-integrity`→**split** into `reserva-ownership-enforcement` + `no-double-booking`, `schema-migrations`→**schema-single-source**, `config-and-secrets`→**secrets-config-hygiene**, `upload-and-cors`→**upload-hardening** (CORS half already in authn-jwt-cookie), `test-foundation`→**ci-tests-green**. Archive syncs per spec-name, never per proposal-name.

## Interfaces / contracts

- Cookies: `iguana_auth` (HttpOnly), `iguana_csrf` (readable). Header: `X-CSRF-Token`. Error body stays `{ "mensaje": ... }`.
- `POST/PUT /api/reserva` request type becomes `CreateReservaDto` (no `PrecioTotal`/`UsuarioId` accepted — server ignores/recomputes).
- `POST /api/anfitrione/registrar`: `RegistroAnfitrionRequest` drops `UsuarioId`; id from `sub`.
- New: `GET /api/auth/me`, `POST /api/auth/logout`. `409` body `{ mensaje: "Fechas no disponibles" }` for exclusion/slot conflicts.

## Waves (capability → wave → PR size → deps)

| Wave | Content (specs/requirements) | Est. lines | Depends on |
|---|---|---|---|
| W1 | `secrets-config-hygiene` (secrets out, `.env.example`, TD1 port map, unified DB name `iguana_sv`/user/pass) + `.sln` adds API + empty Tests project + CI removes "se omite" | ~320 | — |
| W2 | `schema-single-source`: M1+M2, seed split, migrator service, retire scripts (TD5) | ~360 | W1 (compose/conn strings) |
| W3a | `authn-jwt-cookie`: JWT cookie issue/verify/logout/me, CSRF middleware, credentials-aware CORS allowlist, frontend `api.js` (TD4) | ~380 | W2 |
| W3b | `authz-roles-ownership`: `[Authorize]` matrix, admin-only verificacion/role, registrar from token, owner-or-admin publications, gated destructive routes | ~260 | W3a |
| W4 | `reserva-ownership-enforcement`: DTO+validator live, server recompute, owner reads incl. orphan-exclusion, IDOR closure | ~360 | W2 (FK), W3a (sub) |
| W5 | `no-double-booking`: M3 (EXCLUDE + lock-based slot check), `23P01→409`, drop racy pre-checks | ~240 | W2, W4 |
| W6 | `upload-hardening`: magic-byte allowlist, size cap 413, `Content-Disposition`, auth write/delete, public-read policy kept | ~280 | W3a/W3b |
| W7 | `ci-tests-green` completion: cross-wave smoke, Docker smoke asserts `200`, Vitest (CSRF helper, `/me` gate) | ~300 | all |

Each wave ships its own vertical test slice (budgeted in its size); W7 is consolidation. Strict order W1→W2→W3a→W3b→W4→W5→W6→W7; W6 may parallel W4/W5 after W3b. Ask-on-risk gate applies to W2/W3a/W4 (closest to 400).

## Testing strategy

| Layer | Coverage | Harness |
|---|---|---|
| Unit | CSRF compare, price calc (`precio_por_noche × days` half-open), magic-byte sniffer, validator rules | xUnit |
| Integration | Everything HTTP-behavioral: `WebApplicationFactory` + **Testcontainers-Postgres** (per-run collection fixture, migrations applied, seed SQL; cookies carried by `CookieContainer`; forged-cookie cases hand-crafted). Concurrent double-booking via `Task.WhenAll` two POSTs → exactly one 201 + one 409; slot-capacity race under advisory lock; backfill match/case-insensitive/orphan-NULL; M1–M3 `Down` via `ef database update <prev>` | xUnit |
| Guard | Secret-leak scan over tracked files; port-consistency scan (TD1); `has-pending-model-changes` drift check | xUnit/CI step |
| E2E-lite | Compose smoke asserts 200 on public GET; Vitest on `api.js` CSRF header + `/me` rehydration | CI job / Vitest |

## Threat matrix

The skill's tooling matrix (git/PR/shell boundaries): **N/A — no agent-side routing, subprocess, VCS, or executable-file-path classification changes.** The adversarial surface this change owns is user-input classification; its RED tests are: renamed executable bytes rejected (upload), forged/expired cookie → 401, CSRF mismatch → 400, disallowed origin → no CORS header, IDOR → 403/404, concurrent EXCLUDE → 409, oversize → 413, anonymous write → 401 (mapped to W3a/W4/W5/W6 slices above).

## Risks

| Risk | L | Mitigation |
|---|---|---|
| M3 Up fails if pre-existing rows overlap (constraint validation) | Med | Pre-clean UPDATE in same Up + Testcontainers run against prod-shaped seed |
| EF model drift silently re-creates fake gist indexes | Med | Remove L540–548 stubs + CI `has-pending-model-changes` guard |
| Cookie/CSRF breaks existing raw-`fetch` call sites (upload modals, LocationPicker) | Med | W3a audit list of the 4 direct `fetch` sites; Vitest + smoke |
| Backfill email collisions/NULL surprises | Low | unique email index; NULL hidden from non-admins (W4 test) |
| Wave PRs overrun 400 lines | High | W3 split a/b; ask-on-risk gate on W2/W3a/W4 |
| JWT `rol` claim staleness | Low | ownership from DB query; only admin gate uses claim; short TTL |

## Open questions (for tasks, none blocking)

- [ ] Audit prod-shaped seed: confirm no experience reservation has `fecha_fin > fecha_inicio` beyond the documented pre-clean (TD5-M3).
- [ ] Fix exact TTL (proposal: 60 min, `Jwt:ExpiresInMinutes`).
- [ ] Decide fate of legacy `GET /api/imagenes/{bucket}/{fileName}` route (ignores `bucket` today): keep shape, add disposition, or deprecate.
