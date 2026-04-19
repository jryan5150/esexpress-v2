# PCS Bridge — Codebase Audit

**Date:** 2026-04-17
**Author:** Jace / Claude Opus 4.7 session
**Audience:** Internal engineering — future sessions, post-SOW execution
**Status:** Round 4 MVD gate still in force; SOW not signed. Work captured in this session is additive and gate-compliant.

---

## 1. Executive Summary

PCS shipped updated API credentials and the Authorization Swagger on 2026-04-16 (Kyle Puryear email, DO-2821 thread). Two breaks from our existing integration: the Load endpoint moved from `api.pcssoft.com/api/load/*` to `api.pcssoft.com/dispatching/v1/load`, and auth shifted from a static sKey to OAuth2 client-credentials.

This session audited the existing PCS integration code, then built the REST push path end-to-end against the new contract — coexisting with the live SOAP path, flag-gated off. Net delta: contained, blast radius 1/10, schema was already OAuth-ready (`pcs_sessions.session_type` enum includes `'oauth'`).

**Engineering verdict:** the rewrite is a contained plugin-level change. Existing generated `load-client` is reusable with a base-URL override — the 2026-03-06 Kyle Swagger matches the repo spec exactly, so only transport and auth changed, not payload. Dead-code (699-line SOAP service + 5 unused routes) stays put this session; deletion waits until REST is proven in production.

---

## 2. Context

- **Kyle's 2026-04-16 email** (16:02 UTC) delivered: 1Password credential share, updated Load endpoint URL, Authorization API Swagger link. Received via Outlook. Secrets extracted into `/home/jryan/projects/Work/pcs bridge.txt` as an ephemeral holding file — not committed.
- **What Kyle didn't send:** Load API Swagger for the new `/dispatching/v1/load` endpoint (not in the share), sandbox/non-prod URL, explicit `grant_type` confirmation, webhook docs.
- **What we already had:** the full PCS Swagger bundle from Kyle's 2026-03-06 email — Load API v1.0.0.0, Dispatch, File, Location, Invoice specs sitting in `/mnt/c/Users/jryan/Downloads/` and already committed to the repo at `backend/src/generated/pcs/*-api.json`. Direct diff against the Downloads drop confirms the repo spec matches.
- **Round 4 gate rule** (see memory `project_round_4_is_the_gate.md`): Phase 2 (PCS REST push) is post-SOW scope. Build work executed this session is deliberately flag-gated OFF (`PCS_DISPATCH_ENABLED=false`) so no production traffic flows until user explicitly flips.

---

## 3. Current State Inventory

Reconstructed from three parallel Explore-agent passes over `backend/src/plugins/pcs/`, `backend/src/generated/pcs/`, and cross-codebase references.

### 3.1 Plugin wiring

- Registered: `backend/src/app.ts:19,94` — `/api/v1/pcs` prefix
- Entry point: `backend/src/plugins/pcs/index.ts` (8 lines, plugin export)
- Routes: `backend/src/plugins/pcs/routes/pcs.ts` (470 lines, 9 routes)
- Frontend consumers: `frontend/src/hooks/use-dispatch.ts:14,24` — `/pcs/dispatch-preview` and `/pcs/dispatch`
- Scheduler: `backend/src/scheduler.ts` — confirmed **no PCS references**. Dispatch is request-driven, not cron.

### 3.2 Route table (post-session)

| Method | Path                     | Auth / role      | Frontend?            | Backend (post-session)                                  |
| ------ | ------------------------ | ---------------- | -------------------- | ------------------------------------------------------- |
| POST   | `/dispatch-preview`      | authenticated    | ✅ `use-dispatch.ts` | `buildDispatchPackage()` from `lib/dispatch-package.ts` |
| POST   | `/dispatch`              | admin/dispatcher | ✅ `use-dispatch.ts` | `dispatchLoad()` from `pcs-rest.service.ts` (REST)      |
| POST   | `/status`                | admin/dispatcher | ❌                   | `postStatus()` from `pcs-soap.service.ts`               |
| GET    | `/status/:id`            | authenticated    | ❌                   | local DB read, no PCS call                              |
| POST   | `/sync-status`           | admin/dispatcher | ❌                   | local DB read, no PCS call                              |
| POST   | `/clear-routes`          | admin/dispatcher | ❌                   | `clearRoutes()` SOAP                                    |
| GET    | `/health`                | public           | ❌                   | `healthCheck()` SOAP PingWebsite                        |
| POST   | `/send-dispatch-message` | admin/dispatcher | ❌                   | `sendDispatchMessage()` SOAP                            |
| GET    | `/session-status`        | authenticated    | ❌                   | diagnostics only                                        |

### 3.3 Schema touchpoints (`backend/src/db/schema.ts`)

| Table                    | PCS-specific cols                                                     | Status                                                                  |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `assignments` (L199–202) | `pcsSequence`, `pcsDispatch` (jsonb)                                  | In use by both SOAP and REST dispatch paths                             |
| `photos` (L283–285)      | `pcsUploaded`, `pcsAttachmentType`                                    | Pre-wired, not yet writing via REST                                     |
| `pcsSessions` (L295–308) | `sessionType enum('soap','oauth')`, `token`, `companyId`, `expiresAt` | **Already OAuth-ready** — REST session rows write `sessionType='oauth'` |

No schema migrations needed for the OAuth cutover.

### 3.4 Generated clients at `backend/src/generated/pcs/`

| Client             | Spec base URL                                | Used in source?                                             | Verdict                                                     |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `load-client/`     | `api.pcssoft.com/api/load`                   | **Now used** by `pcs-rest.service.ts` via base URL override | Keep — schema matches Kyle's March drop                     |
| `dispatch-client/` | `api.pcssoft.com/api`                        | Unused                                                      | Defer — may need regen if `/truckload/*/dispatch` moved too |
| `file-client/`     | `api.pcssoft.com/api`                        | Unused                                                      | Defer — photo attachments out of scope this session         |
| `location-client/` | `api.pcssoft.com/api/location`               | Unused                                                      | Defer                                                       |
| `invoice-client/`  | `api-pcssoft.com/api/invoice` (typo in spec) | Unused                                                      | Defer + fix typo on regen                                   |
| `auth-client/`     | `api.pcssoft.com/authorization/v1`           | **New this session** — used by `pcs-auth.service.ts`        | Generated 2026-04-17                                        |

### 3.5 Env vars

Pre-session in `.env.example`:

- `PCS_ACCESS_KEY`, `PCS_COMPANY_ID`, `PCS_COMPANY_NAME`, `PCS_COMPANY_LTR`, `PCS_USERNAME`, `PCS_DISPATCH_ENABLED`

Post-session:

- Added: `PCS_BASE_URL` (default `https://api.pcssoft.com`), `PCS_SANDBOX_URL` (empty), `PCS_CLIENT_ID`, `PCS_CLIENT_SECRET`
- Kept: `PCS_ACCESS_KEY` (still used by SOAP service), `PCS_COMPANY_ID`, `PCS_COMPANY_NAME`, `PCS_COMPANY_LTR`, `PCS_DISPATCH_ENABLED`
- Removed: `PCS_USERNAME` (never referenced in source)

### 3.6 Test inventory

- `backend/tests/pcs/pcs-soap.test.ts` — 52 tests, unchanged
- `backend/tests/pcs/pcs-routes.test.ts` — 33 tests, unchanged (flag-off behavior proven identical between SOAP and REST)
- `backend/tests/pcs/pcs-auth.test.ts` — **NEW** — 11 tests (token cache, refresh, singleflight, form-urlencoded body shape, credential gate, response shape validation, DB persistence)
- `backend/tests/pcs/pcs-rest.test.ts` — **NEW** — 5 tests (`buildAddLoadRequest` mapping, weight parsing fallback, diagnostics, disabled-flag short-circuit)

Total PCS test count: **52 + 33 + 11 + 5 = 101, all passing**.

---

## 4. Delta Analysis — Old vs New Contract

### 4.1 Transport

|                | SOAP (legacy, still live)                                                              | REST (new this session)                       |
| -------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------- | --------------------------------------------------- |
| Base URL       | `http://ws.xpresstrax.com/NS_Email.asmx` + 3 others                                    | `https://api.pcssoft.com/dispatching/v1/load` |
| Protocol       | XML SOAP 1.1                                                                           | HTTPS JSON                                    |
| Method         | `PostDispatch` SOAP method                                                             | `POST /` on Load API                          |
| Body           | `{iCompID, iLoadID, sDriverName, sTruckNumber, sTrailerNumber, sStatus}` (flat params) | `AddLoadRequest` union (`TruckLoad            | LessThanTruckLoad | IntermodalLoad`) — we send TruckLoad-shaped payload |
| Response parse | Regex on `<PostDispatchResult>true\|false</...>`                                       | Structured JSON `AddLoad200Response`          |

### 4.2 Auth

|           | SOAP                                    | REST                                                                                                       |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Mechanism | `PCS_ACCESS_KEY` = static sKey          | OAuth2 client-credentials grant                                                                            |
| Exchange  | None — key IS the session               | `POST /authorization/v1/tokens/oauth` with `grant_type=client_credentials&client_id=...&client_secret=...` |
| Header    | SOAP `authHeader: { sKey }`             | `Authorization: Bearer {access_token}`                                                                     |
| TTL       | 24h (app-managed TTL on session marker) | `expires_in` from response, cached until <10% remaining                                                    |
| Refresh   | Re-validate via `IsOnline` SOAP call    | Re-mint via `/tokens/oauth`, singleflight to avoid thundering herd                                         |

### 4.3 Schema contract

Kyle's 04-16 note covered base URL + auth method only. The payload shape of the old Load API (v1.0.0.0 from 2026-03-06) is assumed unchanged. Verified by:

- `diff /mnt/c/Users/jryan/Downloads/PCS-Software-Inc-Load-API-1.0.0.0-resolved.json backend/src/generated/pcs/load-api.json` → identical content (formatting differences only)

Still worth explicit confirmation from Kyle (see §6 Q1).

---

## 5. Reusable Assets — What Ported, What Stayed

### 5.1 Ported into shared lib this session

| Source (SOAP service)                                                            | Destination                                       | Rationale                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `PCS_TO_INTERNAL`, `INTERNAL_TO_PCS`, `mapPcsToInternal()`, `mapInternalToPcs()` | `backend/src/plugins/pcs/lib/status-maps.ts`      | Pure data + pure functions, both paths need them   |
| `buildDispatchPackage()` + `DispatchPackage` type                                | `backend/src/plugins/pcs/lib/dispatch-package.ts` | Pure function, env-only inputs, both paths call it |

### 5.2 Stayed in SOAP service, unchanged

- `getSession()` — sKey session validation via `IsOnline`
- `dispatch()` — legacy SOAP `PostDispatch` wrapper (still the entry point the SOAP route would call, but the `/dispatch` route now calls `dispatchLoad()` from REST instead)
- `postStatus()`, `sendDispatchMessage()`, `clearRoutes()`, `healthCheck()` — still used by 5 unchanged routes
- `diagnostics()` — SOAP-specific checks (still referenced by `/health` and `/session-status` routes)

### 5.3 Net-new this session

| File                                                   | LOC              | Purpose                                                       |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------- |
| `backend/src/generated/pcs/auth-client/**`             | ~900 (generated) | Authorization API client from 2026-04-17 Swagger              |
| `backend/src/plugins/pcs/lib/status-maps.ts`           | 47               | Shared status mapping                                         |
| `backend/src/plugins/pcs/lib/dispatch-package.ts`      | 64               | Shared dispatch package builder                               |
| `backend/src/plugins/pcs/services/pcs-auth.service.ts` | 196              | OAuth2 token provider + cache + singleflight                  |
| `backend/src/plugins/pcs/services/pcs-rest.service.ts` | 315              | REST dispatch service, Load API client with base URL override |
| `backend/tests/pcs/pcs-auth.test.ts`                   | 210              | Unit tests for auth service                                   |
| `backend/tests/pcs/pcs-rest.test.ts`                   | 114              | Unit tests for REST service                                   |

### 5.4 Modified this session

- `backend/src/plugins/pcs/routes/pcs.ts` — 2 import-swaps (buildDispatchPackage from new lib path, dispatch → dispatchLoad), no route additions/removals
- `.env.example` — added OAuth vars, removed dead `PCS_USERNAME`

### 5.5 Explicitly NOT modified

- `backend/src/plugins/pcs/services/pcs-soap.service.ts` — untouched, SOAP path still live for status/clear/message routes
- `backend/src/app.ts` — untouched
- `backend/src/db/schema.ts` — untouched (already OAuth-ready)
- `backend/src/plugins/pcs/index.ts` — untouched
- All existing test files (kept intact, new files added alongside)
- Frontend — zero changes (contract preserved: `/pcs/dispatch-preview` + `/pcs/dispatch`)

---

## 6. Open Questions for Kyle + Draft Reply

Five questions, ordered by impact. Draft reply text at the end of this section ready to send (after user review).

### Q1 — Load API contract confirmation

Kyle's 04-16 note moved the endpoint and auth only. Request explicit confirmation that the payload shape (`AddLoadRequest` with `TruckLoad`/`LessThanTruckLoad`/`IntermodalLoad` variants) from the 2026-03-06 Load API v1.0.0.0 Swagger is still current at `/dispatching/v1/load`.

### Q2 — Sandbox / non-prod base URL

`api.pcssoft.com` is production. Without a sandbox target, first real POST against PCS will land in the client's system of record. Need a non-prod URL before flipping `PCS_DISPATCH_ENABLED=true`. If PCS has no sandbox, we'll need written authorization to test against prod with a throwaway assignment.

### Q3 — `grant_type` confirmation

The Authorization API Swagger declares `grant_type` as required but ships no example value. Almost certainly `client_credentials` per the Authorization API descriptor ("standard OAuth endpoint"). Want explicit confirmation so we don't guess.

### Q4 — Webhook availability

The Authorization API schema includes `InboundWebhookProviderTypeEnum` and `WebhookTagTypeEnum` but no paths expose them. Their presence suggests PCS offers outbound webhooks on load state changes elsewhere. If PCS can push us a callback on dispatch/clear events, it eliminates a polling path we'd otherwise need to build.

### Q5 — Other API families

Kyle only called out Load API as "recently updated." Asking whether `/dispatching/*`, `/location/*`, `/file/*`, `/invoice/*` also migrated from `/api/*` to a new base — so we know whether the other 4 generated clients are salvageable or need regen.

### Draft reply (user to review and send)

> Kyle — thanks, auth contract is clear and the client on our side is wired. Before we flip the live dispatch flag I need three things to avoid polluting the production system plus two smaller asks:
>
> 1. Confirm the new `/dispatching/v1/load` endpoint uses the same Load API v1.0.0.0 contract we received on 2026-03-06 (operations, request/response schemas). The endpoint moved and auth changed — want explicit confirmation that the payload shape did not.
> 2. Sandbox / non-prod base URL for integration testing. `api.pcssoft.com` looks production and we shouldn't be hitting it with dev traffic.
> 3. Confirm `grant_type=client_credentials` for `/authorization/v1/tokens/oauth` — required param with no example in the Swagger.
> 4. I noticed `InboundWebhookProviderTypeEnum` and `WebhookTagTypeEnum` in the Authorization schema but no paths expose them. Does PCS support outbound webhooks on load state changes (dispatch, clear, etc.) that we could subscribe to? If so I'd love a pointer to those docs — could save us a polling path.
> 5. You called out Load API as recently updated. Did the Dispatch, File, Location, or Invoice APIs also migrate from `/api/*` to a new base, or is the March spec still current for those?
>
> Thanks, Jace

---

## 7. Risk Register

| Risk                                                         | Likelihood      | Impact                       | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------ | --------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load API schema drifted silently when PCS moved the endpoint | Low             | High — first live POST fails | Q1 above; `PCS_DISPATCH_ENABLED=false` prevents unverified traffic                                                                                                     |
| No sandbox → first real POST goes to prod                    | Certain (today) | High                         | Flag stays off; wait on Q2 answer before enabling                                                                                                                      |
| 1Password share expires before we extract                    | Low             | Medium                       | Secrets already in `/home/jryan/projects/Work/pcs bridge.txt`; move to secure store post-session                                                                       |
| Token cache leak via process memory                          | Low             | Medium                       | In-memory only, process-local; DB row does store `token` — acceptable for short-lived TTL, but flag for tightening if PCS issues long-lived tokens                     |
| Circuit breaker mis-tuned for REST vs SOAP latency           | Medium          | Low                          | Both use the same `createPcsBreaker()` policy; if REST calls are consistently faster/slower than SOAP, the breaker thresholds may need adjustment post-sandbox testing |
| `postgres.js` Date gotcha on `expiresAt`                     | Low             | Medium                       | `pcs_sessions` insert uses `new Date(entry.expiresAtMs)` — drizzle serializes via ISO. See memory `feedback_postgres_date_gotcha.md`                                   |
| TS error count drift                                         | Low             | Low                          | Baseline 28, current 33 — 5 net-new errors all in existing files, unrelated to PCS. Net delta from this session: 0                                                     |

---

## 8. Effort Sizing (engineering estimates only)

Rough buckets — these are post-session actuals, not client-facing estimates.

| Bucket                                                         | Done this session | Remaining                                                                         |
| -------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| Auth-client codegen                                            | ✅ 10 min         | —                                                                                 |
| OAuth token service (cache + singleflight + tests)             | ✅ ~2h            | —                                                                                 |
| REST dispatch service + payload mapper + tests                 | ✅ ~2h            | Kyle Q1-Q3 confirmations + sandbox URL                                            |
| Route retarget (2 of 9)                                        | ✅ ~15 min        | —                                                                                 |
| Env var cleanup                                                | ✅ ~10 min        | —                                                                                 |
| **Push-to-PCS code path complete**                             | ✅                | —                                                                                 |
| Production cutover                                             | —                 | Kyle responses + SOW signed + flag flip                                           |
| Status sync via REST                                           | —                 | New work; status endpoint from PCS currently unknown                              |
| Webhook inbound (if PCS supports)                              | —                 | Kyle Q4 answer determines scope                                                   |
| SOAP service deletion                                          | —                 | Post-REST-proven; delete pcs-soap.service.ts + 5 unused routes + pcs-soap.test.ts |
| Other generated client regens (dispatch/file/location/invoice) | —                 | Only if Q5 reveals they moved                                                     |

---

## 9. 1Password Share Inventory

**Share link:** `https://share.1password.com/s#d_LaR2pfk-g3hu8L2Bzr9KDBobLP3RjrtJhmxOoEMVk`

**Extracted to:** `/home/jryan/projects/Work/pcs bridge.txt` (ephemeral, NOT committed, NOT logged)

**Contents identified:**

- ClientId (GUID format, Azure AD–style): [REDACTED — see 1Password share or `pcs bridge.txt`]
- ClientSecret: [REDACTED — do NOT log or commit]

**NOT in the share:**

- Load API Swagger for `/dispatching/v1/load` — see Q1
- Sandbox/non-prod URL — see Q2
- `grant_type` example — see Q3
- Webhook docs — see Q4

**Action needed:**

- Move secrets from `/home/jryan/projects/Work/pcs bridge.txt` into a gitignored `.env.local` for local dev and into Railway env vars (`PCS_CLIENT_ID`, `PCS_CLIENT_SECRET`) for production. Delete the holding file after extraction.
- Verify the share has not expired before re-opening; 1Password shares can time out.

---

## 10. Auth-client Codegen Notes

**Source spec:** `/home/jryan/projects/work/esexpress-v2/backend/src/generated/pcs/authorization-api.yaml`
(copied from `/mnt/c/Users/jryan/Downloads/PCS-Software-Inc-authorization-api-v1-resolved.yaml`)

**Generator:** `@openapitools/openapi-generator-cli@2.18.4` (CLI wrapper), invoking `typescript-fetch` generator. Jar version differs from existing sibling clients (v7.21.0 pinned in `openapitools.json`) but output format is compatible — `runtime.ts` structure matches the sibling `load-client/src/runtime.ts` (verified by diff: only header comment and `BASE_PATH` differ).

**Command run:**

```bash
cd backend/src/generated/pcs
npx --yes @openapitools/openapi-generator-cli@2.18.4 generate \
  -i authorization-api.yaml \
  -g typescript-fetch \
  -o auth-client \
  --package-name @pcs/authorization-api
```

**Output shape notes:**

- Files generated at `auth-client/{runtime.ts, apis/, models/, docs/}` — **flat** layout, not nested under `src/` like the existing siblings (`load-client/src/*`). Functional difference: zero. Aesthetic difference: minor; on the next regen of the other clients we should standardize one or the other. Not worth touching now.
- `auth-client/apis/TokensApi.ts` exposes `tokensOauthPost({grantType, clientId, clientSecret})` — this is our entry point for the client-credentials flow.
- Unused models included: `InboundWebhookProviderTypeEnum`, `WebhookTagTypeEnum`, `SortDirection`, `UserSortDirection` — these are in the spec's `components/schemas` but not referenced by any path. They compile clean but are dead for our use.

**Re-generate command** (for future sessions, e.g. if Kyle ships a v2 Authorization Swagger):
Identical to above, after updating `authorization-api.yaml` in place.

**No git commit performed this session.** All new files are uncommitted. User will stage and commit post-review per Round 4 gate discipline.

---

## Appendix A — Files Touched This Session

### Created

- `backend/src/generated/pcs/authorization-api.yaml`
- `backend/src/generated/pcs/auth-client/**` (entire directory)
- `backend/src/plugins/pcs/lib/status-maps.ts`
- `backend/src/plugins/pcs/lib/dispatch-package.ts`
- `backend/src/plugins/pcs/services/pcs-auth.service.ts`
- `backend/src/plugins/pcs/services/pcs-rest.service.ts`
- `backend/tests/pcs/pcs-auth.test.ts`
- `backend/tests/pcs/pcs-rest.test.ts`
- `docs/2026-04-17-pcs-bridge-audit.md` (this file)

### Modified

- `backend/src/plugins/pcs/routes/pcs.ts` — import swap for 2 routes (`/dispatch-preview`, `/dispatch`)
- `.env.example` — OAuth vars added, dead var removed

### Unchanged (safety gates verified)

- `backend/src/plugins/pcs/services/pcs-soap.service.ts`
- `backend/src/plugins/pcs/index.ts`
- `backend/src/app.ts`
- `backend/src/db/schema.ts`
- `backend/src/scheduler.ts`
- All frontend code
- All existing test files

## Appendix B — Verification Evidence

- `cd backend && JWT_SECRET=… npx vitest run tests/pcs/` → **101/101 pass** (52 SOAP + 33 routes + 11 auth + 5 REST)
- `cd backend && JWT_SECRET=… npx vitest run` → 1015 pass / 12 fail. The 12 failures are in `verification/photo-routes.test.ts` and propx date assertions — all pre-existing, none in PCS or anything I touched.
- `cd backend && npx tsc --noEmit 2>&1 | grep -c "error TS"` → **33** (baseline drifted from the 28 in CLAUDE.md; net-new from this session: 0)
- `cd backend && npm run db:generate` → "No schema changes, nothing to migrate"
- `git diff --stat backend/src/plugins/pcs/services/pcs-soap.service.ts backend/src/app.ts backend/src/db/schema.ts frontend/` → only `frontend/dist/index.html` + `frontend/package-lock.json` (both pre-existing dirty at session start)
- Feature flag default: `PCS_DISPATCH_ENABLED = process.env.PCS_DISPATCH_ENABLED === "true"` in both SOAP and REST services → defaults to `false`
