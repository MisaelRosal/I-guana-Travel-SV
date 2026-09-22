# Tasks: security-foundation-hardening ("seguridad-y-cimientos")

> Traces to 38 requirements / 53 scenarios across 8 delta specs (Engram obs #18) and the 7 waves / 8 PRs of `design.md`. Order is strict by dependency. RED test precedes its GREEN production task within each wave. TDD is not repo-wide (`strict_tdd: false`); each wave ships its own vertical test slice as W1 introduces the test project.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2500 authored total; per-wave 240–380 (all < 400) |
| 400-line budget risk | High (W3a ~380, W2 ~360, W4 ~360 approach the cap) |
| Chained PRs recommended | Yes (8 dependency-ordered slices) |
| Suggested split | W1 → W2 → W3a → W3b → W4 → W5 → W6 → W7 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (orchestrator + human pick at gate) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| W1 | Secrets out + unified config + buildable `.sln`/CI enabler | PR #1 | `dotnet test Backend/IguanaSV.Api.Tests --filter Category=Guard` | `docker compose up` boots `:5000` | Revert appsettings/sln/CI/env — no schema or auth touched |
| W2 | Schema single source (M1+M2, seed, migrator) | PR #2 | `dotnet test --filter Category=Schema` + `dotnet ef migrations has-pending-model-changes` | `docker compose up` → migrator completes, seed idempotent | `ef database update <M1.prev>`; revert compose/seed files |
| W3a | JWT cookie + CSRF + CORS + frontend api.js | PR #3 | `dotnet test --filter Category=Authn` | `docker compose up` → login/me/logout roundtrip with `CookieContainer` | Revert Program/AuthController/CsrfMiddleware/api.js |
| W3b | Endpoint role/ownership matrix | PR #4 | `dotnet test --filter Category=Authz` | same, authenticated requests | Revert `[Authorize]` attributes/registrar DTO |
| W4 | Reserva DTO/validator/price/owner scoping (IDOR) | PR #5 | `dotnet test --filter Category=Reserva` | same, POST/GET /api/reserva | Revert ReservaController/DTO/Entity |
| W5 | EXCLUDE + advisory-lock capacity + 409 | PR #6 | `dotnet test --filter Category=Concurrency` | `docker compose up` → concurrent POSTs | `ef database update M2` (M3 down) |
| W6 | Magic-byte/size/disposition/auth uploads | PR #7 | `dotnet test --filter Category=Upload` | curl multipart against MinIO route | Revert ImagenesController/MinioStorageService |
| W7 | Cross-wave smoke + Vitest + guard wiring | PR #8 | `dotnet test` + `npm test` (Vitest) | `docker compose up` → smoke 200 | Revert test project/CI workflow |

## Wave 1 (W1): secrets-config-hygiene + build enabler — PR #1 (~320)

- [x] 1.1 RED guard: secret-leak scan over tracked files fails on committed creds — `Backend/IguanaSV.Api.Tests/Guard/SecretLeakGuardTests.cs`
- [x] 1.2 RED guard: port-consistency test greps `launchSettings.json`/`docker-compose.yml`/Vite proxy for `5000` — `.../Guard/PortConsistencyTests.cs`
- [x] 1.3 Purge creds from `appsettings.json` → user-secrets/env; add `.env.example` (API_PORT=5000, DB `iguana_sv`)
- [x] 1.4 Unify DB name/user/pass across `appsettings.json`, `docker-compose.yml`, connection string (TD1)
- [x] 1.5 `Properties/launchSettings.json` http profile `applicationUrl` → `http://localhost:5000`
- [x] 1.6 Fix `Backend/IguanaSV.Api.sln`: add API project + empty `Backend/IguanaSV.Api.Tests` (xUnit)
- [x] 1.7 `.github/workflows/pr-validation.yml`: drop "se omite"; build `.sln`, run `dotnet test`

## Wave 2 (W2): schema-single-source — PR #2 (~360)

- [x] 2.1 M1 `AbsorbPendingSchemaDrift` (horarios.fecha date, reservas.metodo_pago/fecha_pago/id_transaccion), reversible
- [x] 2.2 M2 `AddReservaUsuarioOwnership`: `reservas.usuario_id` INT NULL + FK SET NULL + idx; backfill `lower(btrim(email))=lower(btrim(u.email))`
- [x] 2.3 RED integration: backfill matches case-insensitively; non-match stays NULL (orphans preserved)
- [x] 2.4 Delete two `HasMethod("gist")` stubs L540–548 in `IguanasDbContext.cs`; exclude EXCLUDE from model
- [x] 2.5 RED guard: `dotnet ef migrations has-pending-model-changes` empty (no drift)
- [x] 2.6 `init.sql` → `database/seed.sql` (DDL stripped, INSERTs existence-guarded); remove postgres `initdb.d` mount
- [x] 2.7 Add one-shot `migrator` service (dotnet-ef + psql): wait healthy → `ef database update` → seed; `backend` depends_on `service_completed_successfully`
- [x] 2.8 Retire `run-migrations.sh` and `add_*.sql`

## Wave 3a (W3a): authn-jwt-cookie — PR #3 (~380)

- [x] 3.1 `AddAuthentication().AddJwtBearer`: `TokenRetriever` from `iguana_auth` cookie, `OnMessageReceived` Bearer fallback, RoleClaimType=rol/NameClaimType=sub, keys+`Jwt:ExpiresInMinutes` from config
- [x] 3.2 `AuthController` login/register: BCrypt verify → sign JWT → set `iguana_auth`(HttpOnly,Lax,Secure-prod)+`iguana_csrf`(readable); body has no token
- [x] 3.3 NEW `Middleware/CsrfMiddleware.cs`: non-GET+authed+not(login/register) → `X-CSRF-Token`==`iguana_csrf` constant-time else 400; GET exempt
- [x] 3.4 Pipeline order `UseAuthentication`→`CsrfMiddleware`→`UseAuthorization`→`MapControllers`
- [x] 3.5 CORS `AllowCredentials` config allowlist (replace `AllowAnyOrigin`)
- [x] 3.6 `GET /api/auth/me` [Authorize] rehydrate rol from DB; `POST /api/auth/logout` clears both cookies
- [x] 3.7 RED integration: forged/expired cookie→401; CSRF mismatch/missing→400; disallowed origin→no CORS header; login sets both cookies no token in body
- [x] 3.8 `Frontend/src/api.js`: `csrf()` helper + auto `X-CSRF-Token` on POST/PUT/PATCH/DELETE; audit 4 direct fetch sites (upload modals, LocationPicker)
- [x] 3.9 Frontend: replace `sessionStorage.iguana_usuario` role reads with `GET /api/auth/me`

## Wave 3b (W3b): authz-roles-ownership — PR #4 (~260)

- [x] 4.1 `[Authorize]` on all mutating actions across `{Anfitrione,Publicacione,Imagenes,Reserva}Controller.cs` (also Notificacione + auxiliary CRUD controllers: Amenidade/Categoria/Departamento/Municipio/Experiencia/Horario/ImagenesPublicacion/PublicacionAmenidad/ReservaHorario; reserva GET list/detail require auth, availability read stays anonymous)
- [x] 4.2 `[Authorize(Roles="admin")]` on verificacion + role-change paths (generic host PUT now preserves `Verificado`/`UsuarioId` for non-admins, closing the whole-entity self-verify bypass; only registrar may self-promote usuario→anfitrion)
- [x] 4.3 `POST /api/anfitrione/registrar`: `RegistroAnfitrionRequest` drops `UsuarioId`; id from `sub`
- [x] 4.4 Owner-or-admin gate on publication mutations (owner = `Anfitriones.UsuarioId == sub` via DB query; PUT also verifies the target host is caller-owned; `GET anfitrion/{id}` is owner-or-admin)
- [x] 4.5 RED integration: anonymous write→401; non-admin verificacion→403; public GET read→200 — `Backend/IguanaSV.Api.Tests/AuthZ/AuthzIntegrationTests.cs` (`Category=AuthZ`, 14 facts on the shared W3a `AuthApiFixture` container)

## Wave 4 (W4): reserva-ownership-enforcement — PR #5 (~360)

- [x] 5.1 `Entities/Reserva.cs` +`UsuarioId` (landed with W2's FK); POST/PUT `/api/reserva` bind `Models/CreateReservaDto` — DTO carries only client fields (publicacionId, guest, dates, guests count); `PrecioTotal`/`UsuarioId`/`Estado`/payment keys removed and ignored by the binder
- [x] 5.2 Run `Validators/CreateReservaValidator.cs` via DTO binding (`AddFluentValidationAutoValidation` + assembly scan make it live; its `PrecioTotal` rule removed with the field); `usuario_id = User.GetSubjectId()` from the token, `Estado` pinned `"pendiente"` server-side
- [x] 5.3 Server recompute `PrecioTotal = precio_por_noche × days` (half-open [checkin,checkout), clamped ≥1); experience: spec leaves the formula open → `personas × (precio_por_noche + experiencias.precio_adicional)` with a comment citing the spec point; PUT recomputes too and never reparents the publication
- [x] 5.4 `GET /Reserva` owner-scoped by `sub`; admin all; orphan-NULL rows hidden from non-admins; `GET /Reserva/{id}` non-owner → 404 (existence not leaked); `pagar` sets `MetodoPago`/`FechaPago`/`IdTransaccion` server-side and never touches `PrecioTotal`
- [x] 5.5 RED integration: precio 3×100→300 with client-sent precio ignored; IDOR other-user row→403/404; orphan-NULL not returned to non-admin — `Backend/IguanaSV.Api.Tests/Reserva/ReservaOwnershipIntegrationTests.cs` (`Category=Reserva`, 10 facts on the shared W3a `AuthApiFixture` container, incl. PUT no-override and cancelar/pagar gates)

## Wave 5 (W5): no-double-booking — PR #6 (~240)

- [ ] 6.1 M3 `ReplaceRacyIndexesWithExclusions` raw SQL: pre-clean experiencia `SET fecha_fin=fecha_inicio`, drop both fake GiST indexes, ADD `reservas_no_overlap_lodging` EXCLUDE `daterange '[)'` WHERE estado distinct 'cancelada' + btree `horarios` unique
- [ ] 6.2 Map `23P01` exclusion violation → 409 `{ mensaje:"Fechas no disponibles" }`
- [ ] 6.3 Advisory-lock capacity: `pg_advisory_xact_lock(horario_id)`, `SUM(numero_huespedes)` active + new ≤ `capacidad_maxima` else 409; drop racy `AnyAsync`, fix inclusive `<=`/`>=` to `[)`
- [ ] 6.4 RED integration: concurrent two POSTs `Task.WhenAll` → exactly one 201 + one 409; adjacent ranges→201; slot over max→409
- [ ] 6.5 RED: M3 `Down` via `ef database update <M2>` restores prior indexes

## Wave 6 (W6): upload-hardening — PR #7 (~280)

- [ ] 7.1 Magic-byte allowlist sniffer in `ImagenesController.cs`/`Services/MinioStorageService.cs` → reject renamed wrong bytes 415
- [ ] 7.2 Enforce size cap → 413 oversize
- [ ] 7.3 Set `Content-Disposition` on serve; keep bucket public-read policy
- [ ] 7.4 `[Authorize]` on upload write/delete routes; public read stays 200
- [ ] 7.5 RED: magic-byte mismatch→415; oversize→413; anon write/delete→401; public read→200

## Wave 7 (W7): ci-tests-green completion — PR #8 (~300)

- [ ] 8.1 Consolidate cross-wave smoke: `docker compose` smoke asserts `200` on public GET (no skip)
- [ ] 8.2 Vitest on `api.js`: CSRF header injected on mutation; `/me` rehydration gate
- [ ] 8.3 Wire guard tests (secret-leak, port, `has-pending-model-changes`) into CI job
- [ ] 8.4 CI runs `dotnet test` + `npm test` (Vitest) — both green

## Open Decisions (non-blocking, from design)

- [ ] OD-1: Audit prod-shaped seed — confirm no `experiencia` reservation has `fecha_fin > fecha_inicio` beyond the documented M3 pre-clean (W5)
- [x] OD-2: Fix exact JWT TTL (proposal: 60 min `Jwt:ExpiresInMinutes`) — set in W3a 3.1
- [ ] OD-3: Decide fate of legacy `GET /api/imagenes/{bucket}/{fileName}` (ignores `bucket`): keep shape + disposition or deprecate (W6)
