# Tasks: Host ↔ Traveler Chat (`host-traveler-chat`)

Scenario ids, spec order: THM1–12 (`specs/traveler-host-messaging`), INB1–10 (`specs/chat-inbox`), ACC1–8 (`specs/chat-access-control`).
Precedents (read-only, do not edit): Resena slice (`ResenaController.cs`, `CrearResenaValidator.cs`, `IguanasDbContext.cs` resena block), `services/resenas.js`, `CrearPublicacionModal`, `ResenaIntegrationTests.cs` fixtures.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,800–2,600 |
| 400-line budget risk | High |
| Chained PRs recommended | No — `size:exception` ALREADY approved by maintainer for single-pr (obs #202); do not re-ask |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |
| Decision points during apply | 0 — all 9 decisions settled in design.md; implement as pinned |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

One PR; task order = natural work units so commits/reviews flow backend→frontend (schema → endpoints → surface → i18n → tests → verification).

## Phase 1: Backend schema

- [x] 1.1 Create `Backend/IguanaSV.Api/Entities/Conversacione.cs` and `Backend/IguanaSV.Api/Entities/Mensaje.cs`, scaffold naming, Resena shape
- [x] 1.2 Modify `Backend/IguanaSV.Api/Infrastructure/IguanasDbContext.cs`: DbSets + snake_case blocks — unique `conversaciones_viajero_usuario_id_anfitrion_id_key`, `idx_conversaciones_anfitrion`, `idx_conversaciones_ultimo_mensaje` (DESC), `idx_mensajes_conversacion_creado` (conversacion_id, creado_en DESC, id DESC), check `mensajes_mensaje_check` (char_length 1–500), `publicacion_id` FK SetNull, cascade FKs
- [x] 1.3 Add migration `<yyyyMMddHHmmss>_AddChatConversaciones` (+Designer +snapshot) via `dotnet ef` from `Backend/`; Down drops mensajes→conversaciones. Done: `dotnet build IguanaSV.Api/IguanaSV.Api.csproj -c Release`

## Phase 2: Backend endpoints (`/api/Chat/...`)

- [x] 2.1 Create `Backend/IguanaSV.Api/Models/ChatDtos.cs`: `[JsonPropertyName]` snake_case (global camelCase untouched); keyset envelope `{ mensajes, cursor:{before_creado_en,before_id}|null }`
- [x] 2.2 Create `Backend/IguanaSV.Api/Validators/CreateMensajeValidator.cs`: trim, non-empty, ≤500 (THM6, THM7)
- [x] 2.3 Create `Backend/IguanaSV.Api/Controllers/ChatController.cs` open-or-get `GET anfitrion/{anfitrionId}`: host side resolved server-side from `anfitriones.usuario_id`, NULL/unknown → 404 no row; 200 even on create; insert race → 409 Spanish `mensaje` (THM1–4, ACC6); subject claim only, body `viajero_usuario_id` ignored (ACC3)
- [x] 2.4 Send `POST {id}/mensajes` → 201 + persisted body; stamps `ultimo_mensaje_*` same SaveChanges; optional `publicacion_id` stored verbatim; non-participant → 404 (THM5, THM8, THM9, ACC1, ACC8)
- [x] 2.5 History `GET {id}/mensajes`: `before_creado_en`+`before_id` both-or-neither, fixed 50 newest-first, tie-break (creado_en,id); participant gate 404-not-403; content passthrough (THM10–12, ACC1, ACC2)
- [x] 2.6 `PUT {id}/leido`: sets ONLY caller's `ultimo_leido_*_en` = conversation MAX(creado_en), no-op empty; `GET no-leidos` → Σ per-role counts vs other side (INB4–6, ACC1)
- [x] 2.7 Inbox `GET mias`: role-filtered rows `conversacion_id, contra_nombre, contra_foto, ultimo_mensaje_texto, ultimo_mensaje_en, no_leidos`; admin non-participant absent (INB1–3, ACC4)
- [x] 2.8 Audit ChatController: every endpoint `[Authorize]`, existing cookie/CSRF surface only (no chat plumbing), anonymous → existing 401, admin gets nothing extra, no 429 anywhere (ACC1–5, ACC8)

## Phase 3: Frontend surface

- [x] 3.1 Create `Frontend/src/services/chat.js` mirroring resenas service (CSRF automatic)
- [x] 3.2 Modify `Frontend/src/services/experiencias.js`: `mapearPublicacion` adds `publicacionId: p.id` (test-pinned, never route `:id`)
- [x] 3.3 Create `Frontend/src/components/ChatPanel.jsx`: drawer shell (`useModalAccesible`, props `abierto/anfitrionId/publicacionId?/onCerrar`) wrapping shared `ChatConversation`: 4s page poll paused on `document.hidden` + immediate tick on return, cursor append, `PUT leido` on foreign message visible, 500 counter, publication card (title/price/link), `aria-live`, focus trap/Esc (THM8–12, INB7)
- [x] 3.4 Wire entries: "Contáctame" in `Frontend/src/pages/PerfilAnfitrion/PerfilAnfitrionPage.jsx` (no card, THM9) + host card in `Frontend/src/pages/ExperienceDetail/ExperienceDetailPage.jsx` binding `publicacionId` (THM8); unauth → login link `state={{from}}`; no affordance on non-host surfaces (ACC6, ACC7)
- [x] 3.5 Create `Frontend/src/pages/Chat/ChatPage.jsx` (inbox + inline `ChatConversation`, open→leido) + route entry `mensajes`/`messages` in `Frontend/src/i18n/routes.jsx` and `Frontend/src/App.jsx` (INB1–3, INB6)
- [x] 3.6 Create `Frontend/src/hooks/useChatNoLeidos.js` + Header badge in `Frontend/src/layouts/Header.jsx`: shared 15s poll both roles, stops sign-out, no reload (INB7, INB8)

## Phase 4: i18n

- [x] 4.1 Create `Frontend/src/locales/es/chat.json` (canonical) + `Frontend/src/locales/en/chat.json`; register `chat` ns in the three lists of `Frontend/src/i18n/config.js` — chrome localized, bodies verbatim, en-missing falls back es (INB9, INB10)

## Phase 5: Tests

- [x] 5.1 Create `Backend/IguanaSV.Api.Tests/Chat/ChatIntegrationTests.cs` (Testcontainers, `[Collection("AuthN")]`, SkippableFact, Trait Chat; `/Auth/register` + DbContext fixtures): open/idempotent/409-race, NULL+no-host 404 zero-rows, send 201/500-ok/400, keyset 51→50+1 no gaps, passthrough (THM1–7, THM12, ACC3)
- [x] 5.2 Same file: authz/inbox/unread groups — foreign 404 ×4 ops, participant 2xx, admin probe/inbox, spoof ignored, anonymous 401 no writes, never-429; inbox both roles one row; unread 2, mark moves caller only, badge 3→0 host kept (ACC1–6, INB1–6, THM8–9 context rows)
- [x] 5.3 Frontend suites: `Frontend/src/services/__tests__/chat.test.js` (URLs), `Frontend/src/components/__tests__/ChatPanel.test.jsx` (open→page→leido, cursor, card=`publicacionId`, counter, trap/Esc, aria-live), `Frontend/src/pages/Chat/__tests__/ChatPage.test.jsx`, Header badge fake-timers 15s/hidden-pause, entry CTA tests, `Frontend/src/i18n/__tests__/routes.test.jsx` `/mensajes` (THM8–11, INB7–10)
- [x] 5.4 From `Frontend/`: `npm test` green — 33 files, 264 tests passed, zero failures

## Phase 6: Verification

- [x] 6.1 From `Backend/`: `dotnet test IguanaSV.Api.sln -c Release` — 161 passed, 4 skipped, 0 failed; Chat suite green
- [x] 6.2 From `Frontend/`: `npm run build` green
- [ ] 6.3 Empty-content-DB runtime pass (separate from Testcontainers): script API fixtures on compose (2 users, host via `/Anfitrione/registrar`, publication), then manual verify: both entries open same thread, host reply previews in both inboxes, badges increment/clear in polling window (Success Criteria 1–3)
- [x] 6.4 Confirm: no new NuGet/npm deps; no email; no translation code — `mensajes_traducciones` shape stays design-appendix only

## Apply Progress (Cumulative)

**Store**: OpenSpec. Progress is recorded in this change's `tasks.md` following the OpenSpec apply convention; the native `apply-progress` locator was unresolved, so no separate locator was invented.

**Delivery**: Single PR with maintainer-approved `size:exception`; the review forecast remains above 400 changed lines. Existing implementation commits on `feat/host-traveler-chat`: `c63df44` (schema/migration), `ea2639b` (backend endpoints), and `0c80fa9` (frontend chat surface). The first 18 tasks (1.1–4.1) remain complete.

**Newly completed**: 5.1–5.4, 6.1, 6.2, and 6.4. Total: 25/26 tasks. Task 6.3 remains unchecked because the compose registration route is configured for email verification (`Email__VerificacionHabilitada=true`) and registration sends an external verification email; no test account was created or email triggered. The compose services are running, but the empty-content database and browser scenario were not verified.

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused tests | `dotnet test IguanaSV.Api.Tests/IguanaSV.Api.Tests.csproj -c Release --filter "Category=Chat"`: 26 passed, 0 failed, 0 skipped. `npm test`: 33 files passed, 264 tests passed. |
| Runtime harness | Testcontainers-backed chat integration suite passed. `docker info` confirmed the local daemon is available and `docker compose ps` showed the local services running. The separate empty-content-DB/manual UI scenario was not run because its registration flow would send external email; task 6.3 stays incomplete. |
| Rollback boundary | Revert the chat integration/UI test additions and these task-progress changes; no production chat files or package manifests are changed in this apply work unit. |

### Verification Evidence

- `dotnet test IguanaSV.Api.sln -c Release`: 161 passed, 4 skipped, 0 failed (165 total).
- `npm test`: 33 test files passed; 264 tests passed.
- `npm run build`: succeeded; Vite transformed 161 modules. Vite reported the existing production bundle exceeds 500 kB.
- `docker info`: local Docker daemon available.
- `docker compose ps`: local compose services running. Runtime test intentionally stopped before registration because email verification is enabled; no email was sent and no compose database rows were created.
- Constraint check: no package manifests/project files were changed; ChatController has no email or translation-service integration, and stored chat text remains untranslated.

**Remaining blocker**: 6.3 requires an authorized local setup that can exercise registration without sending external verification email, followed by manual UI checks. Apply remains partial until that evidence is supplied.
