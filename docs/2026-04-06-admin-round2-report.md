# Admin Round 2 Report (NEW PERSONA)

**Date:** 2026-04-06
**Tested via:** code review only (Chrome DevTools MCP unreachable: `fetch failed` on `http://172.17.96.1:9222/json/version`)
**Status:** First-ever audit of admin pages. These were never exercised in Round 1.

## Executive Summary

The admin surface is a facade. All three pages (`/admin/wells`, `/admin/companies`, `/admin/users`) render, but **not a single one of them can actually administer anything**. Wells is read-only with a dead edit button. Companies is a "coming soon" placeholder. Users is a read-only roster. The backend only exposes GET/POST/PUT for wells — no DELETE anywhere — and has zero endpoints for creating users, changing roles, inviting teammates, or deactivating accounts. An admin cannot do a single administrative task in this UI today. Jessica's home page daily target depends on editing `dailyTargetLoads`, and that cannot be done through the UI at all. This is a show-stopper for any attempt to self-manage the system. Good news: the Fastify `requireRole` middleware and schema enum (`admin|dispatcher|viewer`) already exist on the backend, so wiring a real admin console is mostly frontend work plus ~3 new backend endpoints.

## Page Inventory

Only three admin pages exist. All are mounted at `/admin/*` via `frontend/src/app.tsx:84-86` inside the `<ProtectedRoute>` wrapper. The `<ProtectedRoute>` only checks for a token (`frontend/src/components/ProtectedRoute.tsx:4-8`) — it does **not** enforce role, so any authenticated user, including a `viewer`, can navigate to these pages. The sidebar also renders the Admin section unconditionally at `frontend/src/components/Sidebar.tsx:96-119` with no role gate.

| Route              | File                                          | Purpose                       | LOC |
| ------------------ | --------------------------------------------- | ----------------------------- | --- |
| `/admin/wells`     | `frontend/src/pages/admin/WellsAdmin.tsx`     | List wells + filter by status | 193 |
| `/admin/companies` | `frontend/src/pages/admin/CompaniesAdmin.tsx` | "Coming soon" placeholder     | 78  |
| `/admin/users`     | `frontend/src/pages/admin/UsersAdmin.tsx`     | Read-only team roster         | 126 |

## WellsAdmin Findings

**Create flow: MISSING.** There is no "New Well" button anywhere on the page. Search the component — no `<button>` with a plus icon, no dialog, no mutation call. A `useCreateWell()` hook exists in `frontend/src/hooks/use-wells.ts:271-280` and is used by `WellPicker.tsx` (dispatcher quick-add), but it's never imported by WellsAdmin. So the admin page has less capability than the dispatcher picker. The backend endpoint `POST /dispatch/wells/` does exist (`backend/src/plugins/dispatch/routes/wells.ts:101-143`) and requires `admin|dispatcher` role.

**Edit daily target: BROKEN — this is the most critical finding.** The pencil icon button at `WellsAdmin.tsx:180-184` has no `onClick` handler. It is a dead button. Clicking it does literally nothing. The backend endpoint `PUT /dispatch/wells/:id` exists and accepts `dailyTargetLoads` (`backend/src/plugins/dispatch/routes/wells.ts:146-199`), but there is no frontend hook (`useUpdateWell` does not exist), no form, no dialog, nothing. This is THE most important admin task because Jessica's Today's Objectives home screen progress bar reads from `well.dailyTargetLoads` — and right now the only way to change that number is to run raw SQL against production Postgres. That is not a system you can hand off to Jess.

**Delete: NONEXISTENT.** No delete button in the UI. No `DELETE /wells/:id` route in the backend — grep confirms zero matches for `deleteWell` or `DELETE.*wells`. The `wells.service.ts` exports `listWells`, `getWellById`, `createWell`, `updateWell`, and nothing else (`backend/src/plugins/dispatch/services/wells.service.ts:1-124`). If an admin needs to retire a well, the only supported path is to PUT status=`closed` — and even that UI doesn't exist. There's no archival concept either.

**Search / filter: PARTIAL.** The three filter buttons are `all | active | standby` (`WellsAdmin.tsx:23-27`). But the schema's status enum is `active|standby|completed|closed` (`backend/src/db/schema.ts:68-72`). So any wells in `completed` or `closed` status are silently excluded from every filter except `all`. The filter count also has a useless ternary: lines 61-64 filter with `btn.value === "all" ? true : w.status === btn.value` inside a block that already excludes the `"all"` case — dead branch. There is **no text search box**. With many wells this list will be unscannable. The table also has no pagination.

**Operator / basin editing: NOT IN SCHEMA.** I grepped `backend/src/db/schema.ts` for `operator|basin` — zero matches. The wells table has: `name, aliases, status, dailyTargetLoads, dailyTargetTons, latitude, longitude, propxJobId, propxDestinationId, matchFeedback`. There is no operator field, no basin field, no company/customer link. If the real business needs those, they are on the `loads` table (`carrierName`, `customerName`) not the `wells` table. The assumption in the task brief that these are editable was incorrect — they don't exist.

**Other WellsAdmin bugs:**

- `WellsAdmin.tsx:7-12`: the `STATUS_COLORS` map includes `completed` and `closed` but those statuses can never be rendered because the filter hides them.
- Line 44: `overflow-y-auto` but no maxHeight caps the list — if 500 wells land in the db, every row is in the DOM.
- Line 18: `Array.isArray(wellsQuery.data) ? wellsQuery.data : []` — defensive but masks the real API envelope. The `api.get<Well[]>` call in `use-wells.ts:23` assumes the client already unwraps `{success, data, meta}`; worth verifying this isn't hiding a prior bug.

## CompaniesAdmin Findings

**This page is a placeholder.** The entire file (`frontend/src/pages/admin/CompaniesAdmin.tsx:1-78`) is a "Company Management Coming Soon" card with three hardcoded rows of fake carrier names (`Basin Trucking LLC`, `Permian Express`, `West Texas Sand Co`) labeled "Preview -- Auto-Tracked Carriers". No routes, no data, no mutations, no forms.

**There is no companies table in the database.** I grepped `backend/src/db/schema.ts` for `pgTable` definitions — the list is wells/loads/assignments/photos/mappings/drivers/etc, **no companies, no carriers**. Carrier names are stored as freeform strings on `loads.carrierName` (`backend/src/db/schema.ts:113`). The placeholder text is actually honest about this: "Carriers are auto-tracked from load ingestion."

**Verdict:** CompaniesAdmin is not a broken admin page, it's an unbuilt feature. The question for leadership: is a real companies/carriers entity on the roadmap, or should this page be removed entirely to stop giving admins a false expectation? My recommendation: **remove from sidebar until there's a real domain model**, because a "Coming Soon" link in the main nav sends the wrong signal in a production hand-off.

- Create flow: N/A (no backend)
- Edit: N/A
- Delete: N/A
- Search/filter: N/A
- Linkage to wells/carriers: not modeled

## UsersAdmin Findings

**Create user flow: MISSING.** There is no "Invite User" or "Add User" button anywhere (`UsersAdmin.tsx:27-124`). No form, no modal, no mutation. The backend has zero user-creation endpoints — `backend/src/plugins/auth/routes.ts` exposes only `POST /login`, `GET /me`, `GET /users`. No `POST /users`, no `POST /invite`. The `invite.ts` file (`backend/src/plugins/auth/invite.ts`) is a _pure helper function_ that checks whether an email is on the `invitedEmails` table — it is not a route, it is never wired into any endpoint, and no code calls it. The `invited_emails` table exists in schema (`backend/src/db/schema.ts:49-58`) with `email, role, invitedBy, accepted, createdAt`, but it is completely orphaned.

**Role management: NO UI, and no backend either.** The users table lists the role in a badge (`UsersAdmin.tsx:103-108`) but there is no dropdown, no edit button, no way to promote/demote. No `PUT /users/:id` endpoint exists. The `requireRole(['admin'])` guard is in place for `GET /users`, so access is gated, but there is no mutation path. Confirming the task brief: schema allows `admin|dispatcher|viewer` (`backend/src/db/schema.ts:23-25`), and invitedEmails only allows `dispatcher|viewer`. All production users are currently `admin`, but if you wanted to introduce a `dispatcher` role for Jessica/Katie/Stephanie, there is **no way to change their role through the product**. That's a SQL task.

**Deactivate / delete: MISSING.** No delete button. No deactivate toggle. No `isActive` column in the users schema — the table has `lastLoginAt` but no disabled flag. If a dispatcher leaves, the only way to revoke access is to delete the row in Postgres or rotate JWT secrets.

**Password handling:**

- Passwords are stored as bcrypt-ish hashes in `users.passwordHash` (`backend/src/db/schema.ts:22`). Good.
- The UsersAdmin `UserRow` interface (`UsersAdmin.tsx:4-10`) does **not** include `passwordHash` — good, the field is not sent to the frontend.
- There is **no password reset flow**. No "send reset link" button, no temporary password generator. If an admin user forgets their password, there is no self-service path and no admin-assisted path.
- Manual password set: no endpoint.

**Other UsersAdmin bugs:**

- `UsersAdmin.tsx:86-91`: The initials are generated by splitting on spaces and taking first chars. A user named "jryan" renders as "J" (one char). A user with a 3-word name renders as 3 initials before the `.slice(0, 2)` — fine — but will look weird for `O'Brien` etc.
- Line 65: error state is `Failed to load users` with zero details. If it's a 403 (wrong role), a 503 (db down), or a network error, the user sees the same message.
- The table has no sort controls, no search, no pagination. For 5 users it's fine. For 50 it won't be.
- `createdAt` formatted as `toLocaleDateString()` — shows locale-dependent dates (`4/4/2026` for US, `04/04/2026` for others). Use `Intl.DateTimeFormat` with an explicit locale or ISO.

## Cross-cutting Issues

**Error feedback (vague):** All three pages show generic errors. WellsAdmin: "Unable to load wells. Check your connection." (`WellsAdmin.tsx:95-99`) — even if it's a 500 from the backend, user sees "check your connection". UsersAdmin: "Failed to load users". No error codes surfaced, no retry button.

**Loading states:** Present but inconsistent. Wells uses a skeleton loader (`WellsAdmin.tsx:72-88`). Users uses pulsing rectangles (`UsersAdmin.tsx:50-59`). Companies has no loading state because there's no data fetch. No mutation pages exist so "submitting" states can't be evaluated.

**Pagination on long lists:** **None on any page.** WellsAdmin, UsersAdmin both render the full list. The backend `GET /wells/` has no pagination either (`backend/src/plugins/dispatch/routes/wells.ts:11-62` — it returns everything with just `meta.total`). Same for `GET /users`. For a 150-well production dataset this will hurt first paint.

**Audit trail:** None. The wells table has `updatedAt` but no `updatedBy`. Same for users. There is no audit log table in schema. If a well's daily target changes, there's no record of who changed it or when it went from 20 to 25. For a system where the home-page progress bar depends on that number, this is genuinely dangerous — a dispatcher blaming "the system changed my target" has no receipts to contest.

**Mobile:** The sidebar has a mobile responsive pattern (`Sidebar.tsx:47-62`) with a backdrop overlay. But the admin pages themselves use fixed widths on table columns (`w-24`, `w-36`, `w-28`, etc.) that will overflow on a phone. The WellsAdmin table is not wrapped in `overflow-x-auto`. Expect horizontal scroll issues below 640px.

**Sidebar gate leak:** `Sidebar.tsx:96-119` renders Admin links for every user regardless of role. A future `dispatcher` or `viewer` would see them and get a confusing 403 on the backend API call but a working route. The fix is a role check on the current user before rendering that section.

## NEW Issues (HIGHEST PRIORITY)

### ADMIN-01: Daily target is uneditable through the UI (CRITICAL)

- **Where:** `frontend/src/pages/admin/WellsAdmin.tsx:180-184`
- **Repro:** Log in as admin → navigate to /admin/wells → click the pencil icon on any row → nothing happens.
- **Admin impact:** The single most important admin task in the system — setting/adjusting per-well daily load targets — cannot be performed. Jessica's home screen progress depends on this number. Today, the only way to change it is raw SQL against production.
- **Severity:** Show-stopper.

### ADMIN-02: No new-well creation on the admin page

- **Where:** `frontend/src/pages/admin/WellsAdmin.tsx` (missing `useCreateWell` import)
- **Repro:** Navigate to /admin/wells — no "New Well" button.
- **Admin impact:** Admins cannot onboard new well sites without relying on PropX sync or the dispatcher WellPicker quick-add flow. Fixable in ~20 minutes by lifting the pattern from `WellPicker.tsx:41`.
- **Severity:** High.

### ADMIN-03: No user creation, invitation, or role-change flow

- **Where:** `frontend/src/pages/admin/UsersAdmin.tsx` (no mutations) + `backend/src/plugins/auth/routes.ts` (no POST /users, no PUT /users/:id)
- **Repro:** /admin/users is read-only. No button to add a user, invite, or change role.
- **Admin impact:** Onboarding a new dispatcher requires direct database access. This blocks every hire/turnover event.
- **Severity:** Show-stopper for self-managed operation.

### ADMIN-04: No well delete or archive path

- **Where:** `backend/src/plugins/dispatch/services/wells.service.ts` (no deleteWell export)
- **Repro:** There is no DELETE route and no UI. The intended replacement is to set `status=closed`, but no UI surface exists for that either.
- **Admin impact:** Wells accumulate forever. Test wells, obsolete sites, mistakes — all permanent.
- **Severity:** Medium (workaround: SQL).

### ADMIN-05: CompaniesAdmin is a placeholder in the main sidebar

- **Where:** `frontend/src/pages/admin/CompaniesAdmin.tsx` + `frontend/src/components/Sidebar.tsx:107-113`
- **Repro:** Any user can click the Companies link and sees a "coming soon" card with fake sample data.
- **Admin impact:** Signals the product is half-built to anyone handed the login. Either ship a real companies model or hide the link behind a feature flag.
- **Severity:** Medium (credibility).

### ADMIN-06: Admin pages are not role-gated in the frontend

- **Where:** `frontend/src/components/ProtectedRoute.tsx:3-9` + `frontend/src/components/Sidebar.tsx:96-119`
- **Repro:** Any authenticated user (including future `viewer`) can navigate directly to `/admin/wells` or see admin links in the sidebar.
- **Admin impact:** Minor today because all users are admins, but a latent hole the moment real roles are introduced. The backend `GET /users` is properly gated via `requireRole(['admin'])`, so the APIs are safe, but the UI would render a confused broken page for a non-admin.
- **Severity:** Low today, will escalate when roles are added.

### ADMIN-07: Filter hides `completed` and `closed` wells silently

- **Where:** `WellsAdmin.tsx:23-27`
- **Repro:** If any well has status `completed` or `closed`, it will only appear under the "All" filter. There is no "Closed" or "Archive" filter button.
- **Severity:** Low (cosmetic today, worse once archive accumulates).

### ADMIN-08: Generic error messages mask real failures

- **Where:** `WellsAdmin.tsx:97`, `UsersAdmin.tsx:63`
- **Repro:** Simulate 500 vs 503 vs network error — user sees identical string.
- **Severity:** Low, but per rules/patterns.md it violates the "log 500 error details" pattern.

## Show-Stoppers

These block real self-managed admin work and must be fixed before the system can be handed to a non-engineer:

1. **ADMIN-01** — no way to edit `dailyTargetLoads` through the UI. (This is THE admin task.)
2. **ADMIN-03** — no way to onboard, invite, or change roles for users. (Every hire requires SQL.)
3. **ADMIN-02** — no way to create wells without PropX sync or dispatcher-side picker. (Less critical than ADMIN-01 but related.)

## Quick Wins for Round 3 (<30 min each)

1. **Wire the pencil button on WellsAdmin** to an inline editor for `dailyTargetLoads`. Add a `useUpdateWell` hook mirroring `useCreateWell`, PATCH to `PUT /dispatch/wells/:id`, optimistic update. This alone resolves the single highest-impact admin gap.
2. **Add a "New Well" button** on WellsAdmin that reuses `WellPicker`'s create dialog (it already works — see `WellPicker.tsx:41`). Lift the dialog into a shared component.
3. **Hide the Companies sidebar link** behind an `enableCompanies` flag. Costs zero and stops sending a "half-built" signal.
4. **Add the `completed` and `closed` filter buttons** to WellsAdmin, or at least a "Show archived" toggle. Four new entries in `filterButtons`.
5. **Role-check the Admin sidebar section** against `userQuery.data.role === 'admin'` in Sidebar.tsx — two lines, prevents future role leaks.
6. **Surface real error messages** — change "Unable to load wells. Check your connection." to display `error.message` from the axios response when available.

## Bigger Asks (architectural, 1 sprint each)

1. **Real user admin: invite flow + role management.** Wire `backend/src/plugins/auth/invite.ts` to a real `POST /auth/invite` route, create an `acceptInvite` flow, add `PUT /auth/users/:id/role` behind `requireRole(['admin'])`, add a frontend invite modal and role dropdown. Also add an `isActive` boolean on users for deactivation. Estimated ~2-3 days.
2. **Audit log for admin actions.** New `audit_log` table with `userId, action, entityType, entityId, before, after, createdAt`. Decorator wrapping all admin mutations. Viewable on each detail page as "history". Particularly important for daily target changes given their downstream visibility on Jessica's home screen.
3. **Real companies/carriers domain.** Today `loads.carrierName` is freeform text. A real `carriers` table with `id, name, mcNumber, dot, contactEmail, active, createdAt` plus a `wellCarriers` junction and carrier-rate config would make CompaniesAdmin real. Tie into the finance module for carrier payments.
4. **Well detail page.** Clicking a well should open `WellWorkspace` (which already exists at `/wells/:wellId`) — right now the admin table has nowhere to drill into. Consider adding `onClick` on the row to navigate there.
5. **Pagination + search on both list pages.** `GET /dispatch/wells/` and `GET /auth/users` should both support `page, limit, search`. For a post-launch 150+ well portfolio this will start to matter.

## Notes for Next Session

- Browser testing was not possible: Chrome DevTools MCP returned `fetch failed` on `http://172.17.96.1:9222/json/version`. All findings here are from code review. A follow-up session with a working browser should specifically verify: (a) that the pencil button on WellsAdmin does nothing in production (confirmed in code, but visual verification is nice), (b) that the Companies page really ships as a placeholder, (c) that the current admin login does in fact have the `admin` role in its JWT.
- The task brief mentioned editing "operator / basin" fields on wells. Those fields **do not exist in the schema**. Either the brief was wrong, or there's a gap between the dispatch brief and the actual data model. Worth clarifying with Jace.
- I did not check the Settings page (`frontend/src/pages/Settings.tsx`, 1501 bytes, likely tiny) or the ExceptionFeed home page for admin-specific controls. Worth a follow-up pass if "admin" is interpreted broadly.
- All Fastify backend guards and schema enums are already in place (`admin|dispatcher|viewer` with `requireRole` middleware). The expensive architectural work is mostly already done — what's missing is frontend UI and ~3 new backend mutation routes.
- Recommendation: queue ADMIN-01 as the top Round 3 quick-win. It's the one fix that genuinely unblocks Jessica's hand-off.
