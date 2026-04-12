# UX Test Round 2 — Consolidated Findings & Round 3 Action Plan

**Date:** 2026-04-06
**Source reports:** Jessica, Stephanie, Katie, Admin (all in `docs/2026-04-06-*-round2-report.md`)
**Personas tested:** 4 (3 dispatcher + 1 NEW admin persona, never previously tested)
**Test method:** Code review only — Chrome DevTools MCP was unreachable from sub-agents (`ws://172.17.96.1:9222` connection refused). All findings traced through source. Live-browser verification recommended for the items called out in the Methodology section.

---

## Executive Summary

- **The admin surface is a facade.** All three admin pages render but cannot administer anything. Most critically, the per-well `dailyTargetLoads` value — which drives Jessica's entire home-page progress UI — can only be changed by running raw SQL against production. The pencil button on `WellsAdmin.tsx:180` has no `onClick`. There is also no way to invite users, change roles, create wells, or delete anything through the UI. This blocks any hand-off to a non-engineer.
- **The most-asked-for speed feature still does not exist.** Stephanie's #1 Round 1 complaint — keyboard navigation between loads — got zero attention in the overnight sprint. Her speed audit shows ~6 minutes/day of friction left on the table that would die behind one afternoon of `keydown` handler work.
- **A Round 1 fix shipped a UI for a backend that rejects the data.** The Delivered Date inline edit calls a Fastify route whose body schema (`backend/src/plugins/dispatch/routes/loads.ts:95-111`) has `additionalProperties: false` and does not list `deliveredOn`. Every dispatcher attempt to fix a delivery date will get a 400 error toast. One-line schema fix.
- **One CSS class destroyed a Round 1 polish fix across the entire app.** `FilterTabs.tsx:38` applies Tailwind's `capitalize` class on top of the already-perfect FILTER_LABELS dictionary, mangling "BOL Issues" into "Bol Issues". Caught independently by 3 of 4 personas. One-character fix.
- **38 distinct issues across 4 personas.** Tier breakdown: **6 P0 show-stoppers**, **12 P1 high priority**, **11 P2 medium**, **9 P3 cosmetic**. **15 are quick wins (<30 min each).** A focused 4-hour Round 3 sprint should be able to clear all 15 quick wins plus 2-3 of the 30-120 minute items.

---

## P0 — Show-Stoppers (must fix before Round 3 testing or before Monday rollout)

### P0-1. WellsAdmin pencil button is dead — `dailyTargetLoads` can only be changed by SQL — Severity 5 × Reach 4 = **20**

- **Reach:** 1 persona (Admin) hit it directly, but the downstream impact lands on every dispatcher who reads Jessica's home-page progress card.
- **File:line:** `frontend/src/pages/admin/WellsAdmin.tsx:180-184`
- **Repro / observed by:** Admin persona — pencil icon button on each well row has no `onClick` handler. Backend `PUT /dispatch/wells/:id` already accepts `dailyTargetLoads` (`backend/src/plugins/dispatch/routes/wells.ts:146-199`). No `useUpdateWell` hook exists in `frontend/src/hooks/use-wells.ts`.
- **Effort:** 30-120min (add `useUpdateWell` hook + inline number editor or modal + optimistic update)
- **Recommendation:** Mirror the existing `useCreateWell` pattern at `use-wells.ts:271-280`. Add an inline `<EditField inputType="number">` next to the daily target column. This single fix unblocks the system for hand-off to Jess.

### P0-2. Delivered Date inline-edit is broken end-to-end (backend rejects the field) — Severity 5 × Reach 4 = **20**

- **Reach:** 1 persona (Jessica) caught it; affects every dispatcher who tries to correct a delivery date. Round 1 specifically advertised this fix.
- **File:line:** `backend/src/plugins/dispatch/routes/loads.ts:95-111` PATCH body schema has `additionalProperties: false` and does not declare `deliveredOn`. Frontend at `frontend/src/components/ExpandDrawer.tsx:454-465` sends `fieldKey="deliveredOn"`.
- **Repro / observed by:** Jessica — open ExpandDrawer, click Delivered Date, pick new date. Fastify rejects with 400 "must NOT have additional properties". Toast shows "Update failed", date reverts. The underlying `loads.service.updateLoad` already handles `deliveredOn` correctly (`loads.service.ts:82-95`).
- **Effort:** <30min (one-line schema addition)
- **Recommendation:** Add `deliveredOn: { type: ["string", "null"], format: "date" }` to the PATCH body schema's `properties` object.

### P0-3. Single-load Validate fires with no confirm dialog (data-loss risk for new hires) — Severity 4 × Reach 5 = **20**

- **Reach:** Katie + Jessica flagged it. Affects every new dispatcher; misclick rate is high during first week.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:226-240` (`handleValidateSingle`) and `:1104` (onValidate binding).
- **Repro / observed by:** Katie — mis-scroll cursor over green Validate button → instant click → load state flips → only success toast, no undo. Bulk Validate already has `window.confirm` at line 207 — the patterns are inconsistent.
- **Effort:** <30min (copy the pattern from `handleBulkValidate`)
- **Recommendation:** Prefer the bigger ask of an undo-toast pattern, but ship the confirm now. 3-line change.

### P0-4. Missing Ticket button is dead in production — Severity 4 × Reach 5 = **20**

- **Reach:** Jessica + Stephanie. Visible on every BOL Issues row in every well. Was dead in Round 1, still dead in Round 2.
- **File:line:** `frontend/src/components/LoadRow.tsx:277-281`
- **Repro / observed by:** Stephanie — button has no `onClick`. Looks like a button, hover styles like a button, does nothing on click. "This is embarrassing." (her words).
- **Effort:** <30min
- **Recommendation:** Wire `onClick={() => onMissingTicket?.(load.assignmentId)}` and decide the action — Stephanie suggests `handleValidateSingle` to flag for Jessica review; alternative is to open a "missing ticket" form modal with reason + driver. Ship the wire-up now and decide the modal copy in Round 4 if needed.

### P0-5. No user creation, invitation, role-change, or deactivation flow (frontend OR backend) — Severity 5 × Reach 3 = **15**

- **Reach:** 1 persona (Admin), but blocks every hire/turnover event for the entire org.
- **File:line:** `frontend/src/pages/admin/UsersAdmin.tsx` (no mutations), `backend/src/plugins/auth/routes.ts` (only `POST /login`, `GET /me`, `GET /users`). The `invite.ts` helper at `backend/src/plugins/auth/invite.ts` is orphaned — not wired to any route. The `invited_emails` table exists in schema (`backend/src/db/schema.ts:49-58`) but is unused.
- **Repro / observed by:** Admin persona — `/admin/users` is read-only; no invite button, no role dropdown, no deactivate. Schema allows `admin|dispatcher|viewer` but no mutation path exists. To onboard Jessica properly as `dispatcher` instead of `admin`, you currently must run UPDATE in Postgres.
- **Effort:** architectural (~2-3 days; needs `POST /auth/invite`, `acceptInvite` flow, `PUT /auth/users/:id/role`, frontend modal + dropdown, plus an `isActive` column for deactivation)
- **Recommendation:** Schedule as Round 4 or Round 5. For Round 3, ship a clear "Coming soon — contact engineering for user changes" placeholder in `UsersAdmin.tsx` so admins know the limitation rather than assuming the page is broken.

### P0-6. In Loads view, clicking a row bounces to Wells view — kills it as a workspace — Severity 4 × Reach 4 = **16**

- **Reach:** Stephanie hit it directly; affects every dispatcher who tries to use the new cross-well Loads view as a work surface.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:979`
- **Repro / observed by:** Stephanie — `<LoadRow onRowClick={() => handleSelectWell(String(load.wellId))}>`. Click any row → drops you into the well, loses your place in the cross-well list, can't expand the drawer in place, can't see photos, can't copy fields. The new view is unusable as a workbench — only viable as a briefing/dashboard.
- **Effort:** 30-120min (rewire onRowClick + ensure ExpandDrawer can render in cross-well context with `wellName` shown)
- **Recommendation:** Change `onRowClick` to set `expandedAssignmentId` (matching wells view) and keep the user in Loads. This makes Loads view a true workbench rather than a dead-end navigation trap.

---

## P1 — High Priority (ship in Round 3)

### P1-1. `capitalize` CSS class on FilterTabs mangles "BOL Issues" → "Bol Issues" — Severity 2 × Reach 5 = **10**

- **Reach:** 3 of 4 personas (Jessica, Stephanie, Katie) — every dispatcher sees this every time they open Dispatch Desk.
- **File:line:** `frontend/src/components/FilterTabs.tsx:38` (and same risk on `BolQueue.tsx:206`)
- **Repro / observed by:** All three flagged the same root cause. Tailwind `capitalize` lowercases everything except first letter of each word. The FILTER_LABELS dictionary at lines 17-25 already has correct casing.
- **Effort:** <30min (one-word removal)
- **Recommendation:** Remove `capitalize` from the className. Optionally replace with `normal-case` to be explicit.

### P1-2. ExpandDrawer has no Mark Entered button — biggest single speed-loss in the app — Severity 4 × Reach 4 = **16** (~6 min/day per dispatcher)

- **Reach:** Stephanie's biggest ask. Touches every load every dispatcher enters every day.
- **File:line:** `frontend/src/components/ExpandDrawer.tsx:744-834` action column has Copy/Validate/Duplicate/Collapse but no Mark Entered.
- **Repro / observed by:** Stephanie — current flow forces Copy All Fields → paste in PCS → Collapse drawer → find row again → click tiny Entered pill → next load. Stephanie measured ~3 sec × 94 loads/day = 5 min/day of pure hunting.
- **Effort:** 30-120min (pass `onMarkEntered` prop from DispatchDesk → render button matching Validate treatment → ensure pcsStartingNumber is computed correctly per the existing `handleMarkSingle` logic)
- **Recommendation:** Highest-leverage P1 item. ~15-30 minutes of work, gives Stephanie hours/year back.

### P1-3. LoadRow checkbox not keyboard-accessible (WCAG failure) — Severity 4 × Reach 4 = **16**

- **Reach:** Jessica caught it; affects all keyboard-first users (Katie shortcut user, Stephanie RSI). Latent compliance risk if pitched to bigger clients.
- **File:line:** `frontend/src/components/LoadRow.tsx:117-131`
- **Repro / observed by:** Jessica — `<input type="checkbox">` has `readOnly`, `pointer-events-none`, no `onChange`. Tab/space toggling doesn't work. Click on the wrapping div works but only for mouse users.
- **Effort:** 30-120min (refactor to native onChange + remove pointer-events-none)
- **Recommendation:** Drop `readOnly` and `pointer-events-none`, move toggle to the `<input>`'s own `onChange` handler with `e.stopPropagation()`.

### P1-4. Onclaim missing in Loads view — Severity 3 × Reach 4 = **12**

- **Reach:** Stephanie. Loads view inconsistent with Wells view.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:940-981` — LoadRow in Loads view is rendered without `onClaim` prop. Wells view at `:1115-1123` wires it.
- **Repro / observed by:** Stephanie — can't claim a load from Loads view; have to navigate to the well first, defeating the flat-list pitch.
- **Effort:** <30min (copy the existing wells-view block)
- **Recommendation:** Lift the `onClaim={currentUserId && !load.assignedTo ? ... : undefined}` block to a shared variable used by both LoadRow renders.

### P1-5. enteredIds resets on refresh, no persistence — Severity 4 × Reach 3 = **12**

- **Reach:** Stephanie. Daily progress dies on every refresh, navigation, accidental back-button.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:36` `const [enteredIds, setEnteredIds] = useState<Set<number>>(new Set());`
- **Repro / observed by:** Stephanie — pure React state, no localStorage, no server source. Also fragile downstream: after refetch, `enteredIds` contains ghost IDs that aren't in `allLoads` anymore. Completion Summary banner relies on a fragile math tautology that only works in the happy path.
- **Effort:** 30-120min (localStorage keyed by user+date) OR architectural (proper backend `entered_by`/`entered_on` columns + `GET /dispatch/entered-today` endpoint, ~4-6h)
- **Recommendation:** Ship the localStorage version in Round 3 (faster), schedule the backend version as a P2 follow-up. Backend version eliminates the fragile math and enables cross-device sync.

### P1-6. PhotoModal `onFlag` is dead code — flag-for-Jessica still missing — Severity 3 × Reach 4 = **12**

- **Reach:** Stephanie. Replaces ~12 texts a day to Jessica.
- **File:line:** `frontend/src/components/PhotoModal.tsx:20,103,345-352` (component has the prop and button), `frontend/src/pages/DispatchDesk.tsx:1193` (caller never passes `onFlag`).
- **Repro / observed by:** Stephanie — Flag Issue button never renders because the prop is undefined.
- **Effort:** >2hr (need backend `flag_reason` column on assignments + `POST /dispatch/assignments/:id/flag` endpoint + frontend wiring + new "Flagged" filter tab so Jess sees them)
- **Recommendation:** Real feature work — schedule for Round 3 if time after quick wins, otherwise Round 4.

### P1-7. handleMarkSingle PCS numbering broken when filtered — Severity 3 × Reach 4 = **12**

- **Reach:** Stephanie. Correctness bug — creates audit pain downstream.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:263-276`
- **Repro / observed by:** Stephanie — `findIndex` on `readyLoads` returns -1 when called from a row that isn't in the ready filter (e.g., from BOL Issues filter). `pcsStartingNumber: startNum + idx` then becomes `startNum - 1`. The filter-to-display path and the filter-to-pcs-numbering path are decoupled.
- **Effort:** 30-120min (compute the index from the displayed filtered list, or store the explicit PCS number per row)
- **Recommendation:** Pre-compute `pcsStartingNumber` per assignment when the row mounts based on its position in the filtered list — store on the row, pass through. Alternatively expose an explicit "PCS #" input per row for problematic flows.

### P1-8. CompaniesAdmin is "Coming Soon" placeholder shipped to production sidebar — Severity 3 × Reach 3 = **9**

- **Reach:** Admin persona. Visible to anyone clicking the sidebar — credibility cost.
- **File:line:** `frontend/src/pages/admin/CompaniesAdmin.tsx:1-78` + `frontend/src/components/Sidebar.tsx:107-113`
- **Repro / observed by:** Admin — page is hardcoded fake carrier rows. No carriers/companies table in `backend/src/db/schema.ts` — the data model doesn't exist.
- **Effort:** <30min (hide behind a feature flag or remove the sidebar link)
- **Recommendation:** Ship the hide. The architectural fix (real carriers domain + junction tables) is multi-day work for Round 5+.

### P1-9. Admin pages are not role-gated client-side (latent hole) — Severity 2 × Reach 3 = **6**

- **Reach:** Admin persona. Latent — all current users are admins, but the moment `dispatcher`/`viewer` roles ship, this blows up.
- **File:line:** `frontend/src/components/ProtectedRoute.tsx:3-9` (token check only) + `frontend/src/components/Sidebar.tsx:96-119` (renders Admin section unconditionally)
- **Repro / observed by:** Admin persona. Backend is correctly gated via `requireRole(['admin'])` so APIs are safe — but a non-admin would see admin links and get a confusing 403 page.
- **Effort:** <30min (two lines: gate the sidebar Admin section on `userQuery.data?.role === 'admin'`, plus add a role check to `ProtectedRoute` for `/admin/*`)
- **Recommendation:** Ship now — costs nothing, fixes the moment roles arrive.

### P1-10. Two homepage cards look clickable but aren't — Severity 2 × Reach 4 = **8**

- **Reach:** Katie. Visible on the home page — first thing every dispatcher sees daily.
- **File:line:** `frontend/src/pages/ExceptionFeed.tsx:98-142` — "Confirmed & Ready" and "System" cards are plain `<div>`s with the same border/shadow/spacing as the adjacent "Needs Attention" `<button>`.
- **Repro / observed by:** Katie — clicked "Confirmed & Ready" trying to drill into the ready list, nothing happened.
- **Effort:** <30min (convert to `<button>` and add navigate calls, or visually demote so they don't look interactive)
- **Recommendation:** Make Confirmed & Ready link to `/dispatch-desk?filter=ready`. Either link System to a meaningful page or visually demote it (no border/shadow).

### P1-11. Login animation ignores prefers-reduced-motion (WCAG) — Severity 3 × Reach 3 = **9**

- **Reach:** Jessica + Katie. 2 drivers with vestibular sensitivity.
- **File:line:** `frontend/src/pages/Login.tsx:239-256` — four keyframes + the GhostTitle breathing component, no `@media (prefers-reduced-motion: reduce)` override.
- **Repro / observed by:** Jessica — turn on Reduce Motion in OS settings, login still plays the full 2s entrance plus indefinite breathing.
- **Effort:** <30min (wrap the keyframes in `@media (prefers-reduced-motion: no-preference)`, or globally short-circuit at the root stylesheet)
- **Recommendation:** Ship a global `@media (prefers-reduced-motion: reduce)` rule in `frontend/src/index.css` that zeroes animation-duration and transition-duration on `*`. This kills the bug everywhere at once (not just login).

### P1-12. "Mark Entered" button label says just "Entered" pre-click (looks like a status, not an action) — Severity 2 × Reach 4 = **8**

- **Reach:** Jessica + Katie + Stephanie all noted it. Round 1 promised "Mark Entered" — only the icon was added, the label wasn't.
- **File:line:** `frontend/src/components/LoadRow.tsx:253-261`
- **Repro / observed by:** Jessica — the same word "Entered" appears as both the button label (line 261) and the post-click status (line 264-265). New hires will think the load is already entered and skip it.
- **Effort:** <30min (two-character change)
- **Recommendation:** Render "Mark Entered" pre-click, "✓ Entered" post-click. Match the command bar copy.

---

## P2 — Medium Priority (Round 4 or backlog)

### P2-1. Demurrage panel uses amber/warning coloring but is just a billing line — Severity 3 × Reach 3 = **9**

- **Reach:** Katie. Misleading on every drawer expand for any load with demurrage.
- **File:line:** `frontend/src/components/ExpandDrawer.tsx:604-645` (`bg-[#fef3c7]`, `#92400e` text, `#f59e0b` border)
- **Repro / observed by:** Katie — looks identical to a critical alert. New hires think there's a problem with the load. Actually a routine fee.
- **Effort:** <30min (recolor to neutral/info to match Financial Detail panel at 563-601, or add a tooltip explaining demurrage)
- **Recommendation:** Use neutral coloring unless the demurrage value is genuinely excessive. Add a `title="Demurrage = detention fees when a truck waits beyond free time"` tooltip on the heading.

### P2-2. No "ready for PCS" handoff report — Stephanie still texts Jessica every morning — Severity 3 × Reach 3 = **9**

- **Reach:** Jessica's #1 unmet Round 1 ask. Daily friction.
- **File:line:** No file — entire feature missing. Closest thing is `ExpandDrawer.handleCopyAll` (single load only).
- **Repro / observed by:** Jessica — grepped entire repo for export/csv/pdf/handoff/report endpoints. Nothing.
- **Effort:** 30-120min (shipping option: "Copy ready loads as text" button when `activeFilter === "ready"`, dumps visible loads as clipboard text block) OR >2hr (real `GET /dispatch/dispatch-desk/:wellId/export?format=csv`)
- **Recommendation:** Ship the clipboard version in Round 3 — fastest path to killing daily texts. Stephanie said she'd paste into Teams chat anyway, so text > CSV.

### P2-3. No "last refreshed at HH:MM" indicator anywhere — Severity 3 × Reach 3 = **9**

- **Reach:** Jessica. "Am I looking at fresh data?" anxiety on every page.
- **File:line:** `frontend/src/pages/ExceptionFeed.tsx:66-72` renders today's date but never `dataUpdatedAt`. React Query hooks at `frontend/src/hooks/use-wells.ts:42,51,60,68,76,100` already poll every 30s — the data exists, just not surfaced.
- **Repro / observed by:** Jessica — backend hiccup for 2 minutes, Jessica wouldn't know.
- **Effort:** <30min (~10 lines using `wellsQuery.dataUpdatedAt`)
- **Recommendation:** Add a small "Updated HH:MM:SS" pill in the page header. Color it amber if older than 60 seconds.

### P2-4. Validation page editable fields hidden inside expand panel — Severity 3 × Reach 3 = **9**

- **Reach:** Jessica + Katie. Friction on every Tier 2 review.
- **File:line:** `frontend/src/pages/Validation.tsx:608-706`
- **Repro / observed by:** Jessica — edit fields only appear when row is expanded. Katie — no visible "edit" affordance on the collapsed row; she didn't realize the feature existed. Edit-as-you-review flow is broken into expand → click → type → click → collapse → next.
- **Effort:** 30-120min (auto-expand on hover/focus or display always-visible compact edit fields per row)
- **Recommendation:** Auto-expand on row focus. Add an explicit "Click to edit fields" hint at the row level.

### P2-5. PCS Starting # remains opaque despite tooltip — Severity 3 × Reach 3 = **9**

- **Reach:** Jessica + Katie. Tooltip defines the _number_ but never says what _PCS_ is.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:504-505`
- **Repro / observed by:** Katie — "PCS Start #" with hover tooltip about sequence numbers. New hire still has no idea what PCS is or where to get a starting number.
- **Effort:** 30-120min (replace tooltip with persistent `?` icon + popover; first-run copy explains "PCS = our PCS billing system, ask Jessica for today's starting #")
- **Recommendation:** Tackle alongside the broader jargon glossary work in P2-7.

### P2-6. handleAdvanceAll fires with no confirm (inconsistent with other bulk actions) — Severity 2 × Reach 3 = **6**

- **Reach:** Stephanie. Safety hole in the Command Bar.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:315-324, 544-553`
- **Repro / observed by:** Stephanie — `handleApproveAll`, `handleMarkAll`, `handleBulkValidate` all confirm; `handleAdvanceAll` does not. Fat-finger "Advance All (47)" → 47 loads change state with no undo.
- **Effort:** <30min
- **Recommendation:** Match the existing confirm pattern.

### P2-7. 14 jargon terms with zero glossary, help button, or onboarding — Severity 3 × Reach 3 = **9**

- **Reach:** Katie. New hires lose 8-15 questions to Jessica per day, repeats of last week's questions.
- **File:line:** Across the app — full list in Katie's report. Highlights: BOL, PCS, FSC, Demurrage, Reconciled, Tier 1/2/3, Job ID, Clipboard Bridge, Photo BOL, Assignment, Well Picker, Mark Entered.
- **Repro / observed by:** Katie — grep confirms zero "Help" nav items, zero `?` buttons, only `title=` hover tooltips on a handful of elements.
- **Effort:** Quick-win partial (<30min): add `title=` tooltips on 6 worst offenders. Bigger ask: >2hr for a real `?` help drawer with glossary + first-day checklist.
- **Recommendation:** Ship the tooltip version in Round 3 quick-wins. Schedule the help drawer for Round 4.

### P2-8. Pagination doesn't reset when filter changes — Severity 2 × Reach 3 = **6**

- **Reach:** Jessica. Subtle bug — page 5 of 23 under "all" → click "BOL Issues" (4 items) → empty list.
- **File:line:** `frontend/src/pages/DispatchDesk.tsx:583-586` (filter handler doesn't call `setPage(1)`)
- **Repro / observed by:** Jessica — code review only.
- **Effort:** <30min
- **Recommendation:** Add `setPage(1)` to the filter onChange handler.

### P2-9. WellsAdmin filter excludes `completed` and `closed` wells silently — Severity 2 × Reach 2 = **4**

- **Reach:** Admin. Cosmetic today, blocks archive workflows tomorrow.
- **File:line:** `frontend/src/pages/admin/WellsAdmin.tsx:23-27` (only `all|active|standby` buttons; schema enum has 4 values)
- **Repro / observed by:** Admin persona.
- **Effort:** <30min (add two more filter buttons or a "Show archived" toggle)

### P2-10. WellsAdmin shows full list with no pagination — Severity 2 × Reach 2 = **4**

- **Reach:** Admin. Will hurt at 150+ wells.
- **File:line:** `frontend/src/pages/admin/WellsAdmin.tsx` no pagination component; backend `GET /dispatch/wells/` also returns everything.
- **Effort:** 30-120min
- **Recommendation:** Backlog until well count exceeds ~50 in production.

### P2-11. Sheets service has dead "matched" branch — Severity 1 × Reach 2 = **2**

- **Reach:** No user impact (dead code) but cleanup hygiene.
- **File:line:** `backend/src/plugins/sheets/services/sheets.service.ts:1052`
- **Repro / observed by:** Jessica. Dead branch since photoStatus is only ever written as `attached`/`pending`/`missing` per MEMORY.md.
- **Effort:** <30min
- **Recommendation:** Delete the branch.

---

## P3 — Low Priority / Cosmetic

### P3-1. Empty Loads view doesn't visually point to date picker — Sev 1 × Reach 2 = 2

- **File:line:** `frontend/src/pages/DispatchDesk.tsx:866-874` empty state copy says "Set a date above" but the picker is 300px up the page.
- **Recommendation:** Inline the picker into the empty state, or add an arrow/highlight. <30min.

### P3-2. Loads tab count only shows when date is set — Sev 1 × Reach 2 = 2

- **File:line:** `frontend/src/pages/DispatchDesk.tsx:676-687`. Inconsistent with Wells tab. Add em-dash placeholder or show count anyway. <30min.

### P3-3. Loads view misuses `deliveredOn` prop to render well name — Sev 1 × Reach 2 = 2

- **File:line:** `frontend/src/pages/DispatchDesk.tsx:951` — `deliveredOn={load.wellName ?? null}`. Tech debt; will bite the next refactor. Add a real `wellName` prop to LoadRow. 30-120min.

### P3-4. BolQueue.tsx still has 5 occurrences of "JotForm Submissions" (rename half-done) — Sev 2 × Reach 2 = 4

- **File:line:** `frontend/src/pages/BolQueue.tsx:86, 108, 238, 410, 429`
- **Reach:** Stephanie caught it. Same fix as ExpandDrawer. <30min.

### P3-5. UsersAdmin generic error messages mask real failures — Sev 1 × Reach 2 = 2

- **File:line:** `WellsAdmin.tsx:97`, `UsersAdmin.tsx:63`. Per the project's `rules/patterns.md` "log 500 error details" pattern.

### P3-6. UsersAdmin initials generator weird on single-word/punctuated names — Sev 1 × Reach 1 = 1

- **File:line:** `frontend/src/pages/admin/UsersAdmin.tsx:86-91`. Cosmetic.

### P3-7. UsersAdmin uses locale-dependent date format — Sev 1 × Reach 1 = 1

- **File:line:** `frontend/src/pages/admin/UsersAdmin.tsx`. Use explicit `Intl.DateTimeFormat` or ISO. <30min.

### P3-8. Login lacks product subtitle ("Oilfield water dispatch") — Sev 1 × Reach 2 = 2

- **File:line:** `frontend/src/pages/Login.tsx`. Katie didn't know what she was logging into. <30min copy add.

### P3-9. "Clipboard Bridge // Pre-PCS Staging" subtitle confusing — Sev 1 × Reach 2 = 2

- **File:line:** `frontend/src/pages/DispatchDesk.tsx:420`. New hire can't tell if it's a metaphor or a real feature. Replace with "Loads ready to type into PCS". <30min.

---

## Round 3 Quick-Win Sprint (target: <4 hours of work, 15 items)

Ship these in this order. All are <30 min each. Goal is to clear the entire list in one focused session.

1. **P0-2. Add `deliveredOn` to backend PATCH schema** — `backend/src/plugins/dispatch/routes/loads.ts:95-111`. One line. Unblocks Jessica's Round 1 fix.
2. **P1-1. Remove `capitalize` class from FilterTabs** — `frontend/src/components/FilterTabs.tsx:38`. One word. Restores BOL Issues label across the app.
3. **P0-3. Add `window.confirm` to `handleValidateSingle`** — `frontend/src/pages/DispatchDesk.tsx:226`. Copy the bulk pattern. 3 lines.
4. **P0-4. Wire `onClick` on Missing Ticket button** — `frontend/src/components/LoadRow.tsx:277-281`. One line. Kills the embarrassment.
5. **P1-12. Change LoadRow button label to "Mark Entered" pre-click** — `frontend/src/components/LoadRow.tsx:253-261`. Two-character change.
6. **P1-4. Wire `onClaim` in Loads view** — `frontend/src/pages/DispatchDesk.tsx:940-981`. Copy block from Wells view. 5 minutes.
7. **P2-6. Add confirmation to `handleAdvanceAll`** — `frontend/src/pages/DispatchDesk.tsx:315-324`. Match the existing pattern. 2 minutes.
8. **P2-8. Reset `page` to 1 in filter tab onChange** — `frontend/src/pages/DispatchDesk.tsx:583-586`. One line.
9. **P2-3. Add "Updated HH:MM" pill to ExceptionFeed header** — uses `wellsQuery.dataUpdatedAt`. ~10 lines.
10. **P1-11. Global `prefers-reduced-motion: reduce` rule** — `frontend/src/index.css`. Six-line CSS block. Kills Login animation issue and any future ones.
11. **P1-8. Hide CompaniesAdmin sidebar link behind feature flag** — `frontend/src/components/Sidebar.tsx:107-113`. Two lines.
12. **P1-9. Role-gate Admin sidebar section** — `frontend/src/components/Sidebar.tsx:96-119` plus `ProtectedRoute.tsx`. Two-line `userQuery.data?.role === 'admin'` check.
13. **P2-7 (partial). Add `title=` tooltips on 6 worst jargon offenders** (BOL, PCS, FSC, Demurrage, Reconciled, Tier 1/2/3) on the elements bearing those text labels. Zero DOM additions.
14. **P2-1. Recolor Demurrage panel to neutral/info** — `frontend/src/components/ExpandDrawer.tsx:604-645`. Match Financial Detail style.
15. **P2-11. Delete dead "matched" branch in sheets service** — `backend/src/plugins/sheets/services/sheets.service.ts:1052`. Cleanup.

Plus low-priority extras if time permits: P3-1 inline date picker, P3-4 BolQueue JotForm rename pull-through, P3-9 dispatch desk subtitle copy.

---

## Round 3 Real Work (target: 1 day)

Items in the 30-120min bucket worth doing if quick wins are cleared early:

1. **P0-1. Wire WellsAdmin pencil button + add `useUpdateWell` hook** — unblocks the system for hand-off to Jess. The single most impactful 30-120min fix in the entire backlog. Mirror `useCreateWell` at `use-wells.ts:271-280`, add inline `<EditField>` for `dailyTargetLoads`.
2. **P1-2. Add Mark Entered button to ExpandDrawer action column** — Stephanie's biggest speed ask. Pass `onMarkEntered` from DispatchDesk, render matching Validate treatment. ~15-30 min. Gives ~5 min/day per dispatcher.
3. **P0-6. Rewire Loads-view row click to expand drawer in place** — makes the new Loads view usable as a workbench instead of a navigation trap. Set `expandedAssignmentId` instead of `handleSelectWell`.
4. **P1-3. Refactor LoadRow checkbox for keyboard accessibility** — drop `readOnly` and `pointer-events-none`, move toggle to native onChange. WCAG fix.
5. **P1-5. localStorage persistence for `enteredIds`** — kill the refresh-zero bug. Backend version is bigger work, schedule for Round 4.
6. **P2-2. "Copy ready loads" button on FilterTabs legend when ready filter active** — kills Jessica's daily texts to Stephanie. Reuses existing `handleCopyAll` pattern.
7. **P0-2 follow-up. Add new-well "Plus" button on WellsAdmin** — lifts the existing `WellPicker` create dialog. ~20 min.

If all of the above ship, Round 3 is a major win — every persona's top P0/P1 friction is addressed.

---

## Backlog (architectural, post-Round 3)

The big items that need scoping, scheduling, and review before they ship.

1. **P0-5. Real user admin: invite flow + role management + deactivation.** Wire `backend/src/plugins/auth/invite.ts` to a real `POST /auth/invite`, build `acceptInvite`, add `PUT /auth/users/:id/role`, add `isActive` column on users, frontend modal + dropdown. ~2-3 days. Until then, queue a "Coming soon — contact engineering" placeholder so admins know the limitation.
2. **Keyboard navigation across all of DispatchDesk.** J/K/Arrow with auto-expand-next, Enter to Mark Entered/Validate, C to copy all, F to flag, ? for shortcut sheet. Stephanie's #1 ask, biggest single speed dividend in the app. ~1 day. Extends `DispatchDesk.tsx:355-404`.
3. **Flag-for-Jessica feature (full stack).** Backend `flag_reason` column + `POST /dispatch/assignments/:id/flag`, frontend wiring of dead `PhotoModal.onFlag`, new "Flagged" filter tab. ~4-6 hours full stack. Replaces ~12 texts/day.
4. **Audit log for admin actions.** New `audit_log` table with before/after, decorator wrapping admin mutations, viewable on each detail page. Critical given that `dailyTargetLoads` drives the home-page progress bar — dispatcher needs receipts. ~1-2 days.
5. **Onboarding tour + help drawer + glossary route.** `?` button in header, drawer with 15-term glossary + first-day checklist, `/glossary` static page, optional Driver.js tour on first login. Cuts Katie's question rate in half. ~1-2 days.
6. **Real companies/carriers domain.** New `carriers` table with junction to wells, carrier-rate config, finance integration. Removes the CompaniesAdmin placeholder. Multi-day work, possibly multi-week with finance integration.
7. **Backend-persisted entered-today counter.** New `entered_by` and `entered_on` columns on assignments, `GET /dispatch/entered-today?userId=me` endpoint. Eliminates the fragile math at `DispatchDesk.tsx:1234-1235`.
8. **Diagnostics surface for backend health.** Per the project's `rules/patterns.md` diagnostics convention. Sidebar badge showing `/diag/health` state + most-recent fetch age. Kills three of Jessica's Round 1 complaints in one shot.
9. **Pagination + search on admin list pages.** `GET /dispatch/wells/` and `GET /auth/users/` need `page, limit, search` query params and frontend table controls. Important once well count or user count grows.
10. **Color audit + design-system pass on warning vs neutral.** Demurrage is one example; the broader question is "what does amber mean in this app?" — needs a documented color semantics doc.
11. **Validation page UX rework: always-visible editable fields per row.** Remove the expand-to-edit gate. Bigger refactor than P2-4 — touches the row layout.
12. **Profile mobile responsiveness on admin pages.** Fixed-width columns will overflow below 640px. Wrap tables in `overflow-x-auto` and consider stacked layouts.

---

## Cross-Cutting Themes

Three patterns showed up across multiple findings and personas. These are systemic — worth socializing as team conventions before they recur in Round 3.

### Theme 1: Buttons rendered without onClick handlers — UI shipping ahead of wiring

At least **3 distinct dead buttons** in production:

- Missing Ticket button on LoadRow (Round 1 dead, Round 2 still dead)
- Pencil edit button on WellsAdmin
- Flag Issue button inside PhotoModal (rendered only if onFlag prop passed; never passed)

This is a code smell suggesting that visual scaffolding is being shipped before its handlers are wired. **Convention to adopt:** if a button has no `onClick`, it shouldn't render. Or pass an explicit `disabled` state with a tooltip that says "Coming soon — Round X". A typed wrapper component (`<ActionButton onClick={required}>`) would catch this at compile time.

### Theme 2: Missing confirmation dialogs on destructive/state-changing actions — inconsistent safety patterns

At least **3 actions** flip backend state with no confirm:

- Single-load Validate (Katie P0)
- Advance All Command Bar button (Stephanie P2)
- Single-load Mark Entered (no confirm and no undo, though Stephanie wants it fast — this is intentional speed but still risk)

Meanwhile bulk Validate, Approve All, Mark All Entered all have `window.confirm`. The pattern is inconsistent across single vs bulk and across action types. **Convention to adopt:** every state-changing action needs either a confirm dialog OR an undo affordance with a 5-second timer. Single vs bulk should not be the deciding factor — _destructiveness_ should.

### Theme 3: Backend schemas strip or reject undeclared fields silently, frontend doesn't know

The Delivered Date bug is the clearest example: frontend sends `{deliveredOn: "..."}`, Fastify rejects with 400, user gets a toast. The backend service already supports the field — only the route schema is missing it. This will recur every time someone adds a new inline-edit field on the frontend without updating the backend PATCH schema.

Per the project memory note: "Fastify strips undeclared params" applies to query strings; for request bodies with `additionalProperties: false`, Fastify returns 400 instead of stripping. **Convention to adopt:** the route schema should be the _single source of truth_ for what the frontend can edit. Generate a TypeScript type from the schema (e.g. with `json-schema-to-typescript`), import it on the frontend's `useUpdateLoad` hook, and let the type system catch any new field that isn't in the schema.

---

## Methodology Notes

**Personas tested in Round 2:**

- Jessica Handlin (Dispatch Manager) — workflow oversight, validation, hand-off
- Stephanie (Speed Builder) — find validated, copy to PCS, mark entered fast
- Katie (1-week-new dispatcher) — Jessica walkthrough + zero institutional context
- Admin (NEW persona, never previously tested) — wells, companies, users management

**Test method limitations:**

- All four sub-agents lost their Chrome DevTools MCP connection (`ws://172.17.96.1:9222` connection refused). Testing fell back to code review per the handoff's fallback instructions. This means **no findings in this report were verified live** — the CSS render of `capitalize`, the actual error toast text on the deliveredOn 400, the PCS numbering off-by-one with filtered selection, and the visual look of the dead buttons all need browser confirmation.
- The Sidebar, Login (beyond GhostTitle), and Validation page were NOT covered by Stephanie. The Settings page was NOT covered by anyone. The home-page ExceptionFeed was lightly covered by Katie/Jessica only.
- Backend tests were not run in Round 2. The handoff says `25 passed` was the baseline; recommend re-running `cd backend && npx vitest run tests/dispatch/overnight-gaps.test.ts` after the Round 3 schema fix.

**Recommended Round 3 verification (do these in a live browser before fixing):**

1. **P0-2 deliveredOn 400** — open ExpandDrawer, change Delivered Date, capture the actual error message and HTTP status. Verify the 400 hypothesis before deploying the schema fix.
2. **P1-1 capitalize CSS rendering** — confirm "Bol Issues" in browser. Worth a screenshot as a Round 1 regression record.
3. **P1-7 PCS numbering off-by-one** — manually trigger from BOL Issues filter and verify the actual `pcsStartingNumber` sent to the backend (see network panel).
4. **P0-1 WellsAdmin pencil button** — visually confirm in production that the button does nothing on click.
5. **P0-3 single-load Validate misclick** — confirm the toast wording and verify there's no undo.

**Browser verification follow-up:** if the Chrome DevTools MCP keeps failing, document the failure mode and consider adding a fallback path (e.g., have a non-sub-agent run browser tests with the screenshot capture and feed results back).
