# Exploration — security-foundation-hardening

> Display name: "seguridad-y-cimientos". Phase: `sdd-explore` (read-only). Store: hybrid.
> All findings below were re-verified against real code at git root `I-guana-Travel-SV` (branch `main`), not inherited from the prior audit. Corrections and extra findings are called out.

## Current State

A .NET 10 ASP.NET Core Web API (EF Core 10 + Npgsql + MinIO + FluentValidation + BCrypt) with a React 19 / Vite SPA and a docker-compose stack (postgres, minio, backend, frontend, pgadmin). Domain: a Salvadoran tourism marketplace (experiences/lodging, hosts, reservations, simulated payment).

There is **no authentication and no authorization layer at all**. `Backend/IguanaSV.Api/Program.cs` registers FluentValidation, controllers, DbContext, a MinIO singleton, Swagger and CORS — nothing else. Grep for `[Authorize]`, `AddAuthentication`, `UseAuthentication`, `UseAuthorization`, `RequireAuthorization` across the entire `Backend/` returns **zero matches**. Every controller is anonymous.

The frontend "login" (`AuthController`) hashes/verifies passwords with BCrypt and returns the user object; the SPA stores it in `sessionStorage.iguana_usuario`. There is no token issued, no token sent (`api.js` never sets an `Authorization` header), and role-gated UI (admin panel, host tools) reads `rol` from that client blob — trivially spoofable.

## Affected Areas (verified)

- `Backend/IguanaSV.Api/Program.cs` — no auth services/middleware; CORS `AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()` (L26-30).
- `Backend/IguanaSV.Api/IguanaSV.Api.csproj` — no `Microsoft.AspNetCore.Authentication.JwtBearer` reference.
- `Controllers/AuthController.cs` — login/register use BCrypt, emit `UsuarioResponse` (no token).
- `Controllers/ReservaController.cs` — `POST`/`PUT` bind the **entity** `Reserva` (not `CreateReservaDto`); persist client-supplied `PrecioTotal` verbatim (L123, L168); `GET /Reserva` returns all rows (L20-33); `confirmar/pagar/cancelar/delete` mutate by `id` with no owner check.
- `Entities/Reserva.cs` + `Infrastructure/IguanasDbContext.cs` — `Reserva` has **no `UsuarioId`**; only `PublicacionId` + free-text guest PII (`NombreHuesped/EmailHuesped/TelefonoHuesped`). Confirmed model gap.
- `Validators/CreateReservaValidator.cs` — validates `CreateReservaDto`, so it never runs (controllers take `Reserva`). Dead validator.
- `Controllers/AnfitrioneController.cs` — `PUT {id}/verificacion` flips host verification anonymously (L81-95); `POST registrar` takes `UsuarioId` from body and sets `usuario.Rol="anfitrion"` (L127-165) — mass-assignment; `DELETE {id}` anonymous.
- `Controllers/PublicacioneController.cs` — `DELETE {id}` anonymous + destructive (L302-316).
- `Controllers/ImagenesController.cs` + `Services/MinioStorageService.cs` — upload takes any MIME/size, trusts `file.ContentType`, no magic-byte check; `EnsureBucketExistsAsync` sets a public `s3:GetObject` for `Principal AWS ["*"]`; `DELETE {fileName}` anonymous.
- `appsettings.json` (**git-tracked**) — `Password=1234567890`, MinIO `minioadmin/minioadmin`. `.env` is correctly gitignored (`POSTGRES_PASSWORD=123456789`, DB `iguanaSV`).
- Port/DB divergence: local `dotnet run` → DB `Iguana-SV`/`1234567890`, API on `:5100` (launchSettings); Vite proxy `/api` → `http://localhost:5000`; Docker backend → host `:5000` (container `:8080`), DB `iguanaSV`/`123456789`. **Local dev proxy (:5000) does not match the local API (:5100)** — sharper than the audit stated.
- `database/init.sql` — final schema + seed (`horarios.fecha` L105, `reservas.metodo_pago/fecha_pago/id_transaccion` L141-143); no `__EFMigrationsHistory`; **no `EXCLUDE` constraint**.
- `Migrations/*` + `IguanasDbContextModelSnapshot.cs` — stale: define `rol`/`usuario_id` (AddRolesYPerfilAnfitrion) but **not** the pago columns nor `horarios.fecha`. `add_fecha_horarios.sql` / `add_pago_reserva.sql` hand-patch those. Three sources of truth; `run-migrations.sh` (`dotnet ef database update`) is incompatible with an init.sql-built DB.
- `IguanaSV.Api.sln` — declares **zero projects** → CI `dotnet build IguanaSV.Api.sln` compiles nothing (false green). `pr-validation.yml` test step always prints "se omite" (no `*Tests.csproj`); Docker smoke test accepts any HTTP code on `/api/departamento`.
- `Frontend/package.json` — no `test` script/runner. `IguanaSV.Api.http` still hits `/weatherforecast`. (Dead-code bucket largely confirmed; low priority.)
- Overlap control: `DbContext` declares GiST **indexes** `horarios_no_overlap`/`reservas_no_overlap` (not exclusion constraints); real double-booking protection is only the app-level `AnyAsync` conflict query → race under concurrency.

## Audit verdict

All 8 audit axes are **CONFIRMED** against code. Sharper/new items found while verifying:
- `POST /Anfitrione/registrar` lets any caller promote any `UsuarioId` to host (mass-assignment, sets role).
- `PUT /Anfitrione/{id}/verificacion` and `DELETE /Imagenes/{fileName}` are anonymous (trust-escalation + asset-deletion).
- Admin panel authorization is purely client-side (`sessionStorage.iguana_usuario.rol`).
- No bearer token exists anywhere (this is greenfield auth, not a broken-auth fix).
- The vite→`:5000` vs local-API→`:5100` proxy mismatch means "one-command local run" already diverges from Docker.

## Approaches (compare, do not resolve here)

### A. Authentication
1. **JWT bearer (`Microsoft.AspNetCore.Authentication.JwtBearer`)** — AuthController issues a signed access token with `sub`=userId + `rol` claim; `AddAuthentication().AddJwtBearer()` + `UseAuthentication/UseAuthorization`.
   - Pros: native to the controller stack, matches SPA, stateless, small change surface. Cons: token storage in JS is XSS-exposed; revocation needs short TTL.
2. Cookie session auth — server-side sessions in an httpOnly cookie.
   - Pros: not XSS-readable, built-in. Cons: needs a session store, CSRF handling, less idiomatic for a pure-SPA + Web API. **Effort: Med.**

### B. Token storage (SPA)
| Option | Pros | Cons |
|---|---|---|
| `sessionStorage` (matches current `iguana_usuario`) | consistent with existing code, clears on tab close | XSS-readable |
| `localStorage` | survives reload | XSS-readable, persists |
| httpOnly cookie | XSS-safe | needs CSRF token + `AllowCredentials` CORS; not JWT-bearer style |
| In-memory + refresh cookie | best security | most work |
Recommendation: for this project's maturity, access token in `sessionStorage` (short TTL) keeps consistency with the existing pattern; revisit httpOnly+CSRF only if threat model demands it. **Needs human confirmation.**

### C. Authorization matrix (product decision)
Proposed defaults to confirm: public GET catalog; reservation create/edit/cancel requires authenticated owner; publication create/edit/delete requires host owner **or** admin; host `verificacion` and user role changes require **admin only**; `registrar` binds `UsuarioId` from the token, never from the body.

### D. Server-side enforcement
- Bind `CreateReservaDto` and let `CreateReservaValidator` run; **recompute `PrecioTotal` server-side** (`Publicacion.PrecioPorNoche × nights`), ignore client value. Ownership filter derived from token. Low risk, high value.
- Double-booking race: convert to PostgreSQL `EXCLUDE USING gist` constraints (extension `btree_gist` already enabled). Interlocks with the schema-source-of-truth decision below.

### E. Secrets & config unification
- Remove credentials from tracked `appsettings.json`; use **`dotnet user-secrets`** for local dev + `${ENV}` already used by docker-compose. Single DB name/password/port across all three; align Vite proxy target and `launchSettings` so one command starts. Recommendation: env-var-driven with a committed `.env.example`; user-secrets optional for non-docker dev.

### F. Schema source of truth
| Strategy | Pros | Cons |
|---|---|---|
| **(A) EF migrations = truth** (init.sql → seed only) | versioned, `__EFMigrationsHistory`, repeatable, CI-checkable | must author migrations for drift (pago, fecha, FK, EXCLUDE); Docker must run `ef database update` |
| **(B) SQL = truth** (EF scaffold/DbFirst) | matches current reality, `init.sql` already final | loses EF safety, drift stays, no per-env versioning |
Recommendation: **(A)** — complete migrations to absorb drift, demote `init.sql` to seed, make Docker run migrations. This is the enabling decision for the `usuario_id` FK and the `EXCLUDE` constraints. **Needs human confirmation.**

### G. CORS & uploads
- CORS: replace wildcard with an explicit origin allowlist (dev `http://localhost:5173`/`:5000`, docker `http://localhost`), `AllowCredentials` only if cookies are adopted.
- Uploads: allowlist real image types via magic bytes (jpeg/png/webp), cap size, set `Content-Disposition`; require auth on upload/delete. Bucket: listings are public, so keep public **read** but gate write/delete; consider presigned URLs if private media appears.

### H. Tests
- First fix `IguanaSV.Api.sln` (add API project) and create `IguanaSV.Api.Tests` (xUnit + `Microsoft.AspNetCore.Mvc.Testing` + Testcontainers-Postgres), wire into CI. Frontend: add Vitest + @testing-library for a couple of service functions.
- First flows to cover: login→token; protected reserva create recomputes price; owner-scoped list; host-verification requires admin; overlap EXCLUDE rejects double-book.

## Recommendation (explore-level)

Order the hardening as dependent waves: **(1) config/secrets + `.sln`/CI fix** (independent enablers, low risk, stop false-green and unblock docker) → **(2) choose schema strategy (A)** and absorb drift → **(3) AuthN (JWT) + AuthZ matrix** → **(4) server-side enforcement** (DTO bind + validator + recompute price + owner filter, requires the `reservas.usuario_id` FK from step 2) → **(5) overlap EXCLUDE constraints** → **(6) CORS/uploads bucket** → **(7) tests as vertical slices alongside each wave**. This keeps PRs under the 400-line budget and respects dependency order (auth before authz; schema before FK/constraints; sln/CI before tests matter).

## Open decisions (human must confirm before proposal)
1. Schema source of truth: **(A) EF migrations** vs **(B) SQL**. → recommend A.
2. Token storage: `sessionStorage` vs `localStorage` vs httpOnly cookie(+CSRF). → recommend sessionStorage.
3. Refresh tokens in scope now? → recommend no (short access token only; defer).
4. Add `reservas.usuario_id` FK (needs model+migration+backfill) vs email-based ownership. → recommend add FK.
5. Recompute `PrecioTotal` server-side and treat client value as untrusted. → recommend yes.
6. Authorization matrix — confirm role per endpoint (esp. `verificacion` and role changes = admin only; publish = owner-or-admin).
7. Double-booking: PostgreSQL `EXCLUDE` constraints vs app-level-only. → recommend EXCLUDE.
8. CORS: explicit origin allowlist (+ credentials only if cookies). Confirm the real dev/docker origins.
9. Uploads: type/size validation + auth on delete; keep public-read bucket? Confirm.
10. Initial test scope: which vertical slices are in-scope for this change vs a follow-up.
11. `POST /Anfitrione/registrar` mass-assignment: bind `UsuarioId` from token and remove from body. → recommend yes.

## Risks
- **Sequencing:** schema strategy (D1) gates the FK (D4), the price-recompute enforcement, and the EXCLUDE constraints. Don't start authz enforcement on reservations before the ownership link exists.
- **Migrations/backfill:** adding `usuario_id` requires backfilling existing `reservas` (match `email_huesped`→`usuarios.email`) — some rows may have no user → decide null vs reject.
- **Docker contract:** switching to migrations changes container startup (init.sql seed + `ef database update` ordering); currently init.sql uses `CREATE TABLE IF NOT EXISTS`, so a naive migration run collides.
- **False-green CI now:** any "tests pass" claim before the `.sln` fix is meaningless; fix it first.
- **Config blast radius:** unifying DB name/password touches appsettings, `.env`, docker-compose, run-migrations.sh — low technical risk but easy to miss one.

## Ready for Proposal
**Yes**, contingent on the orchestrator resolving the 11 open decisions (esp. #1 schema strategy, #2 token storage, #4 FK, #10 test scope) with the human. Architecture is otherwise clear and well-bounded; the hardening decomposes cleanly into 400-line PR waves.
