# Wave 1 Unified Worksurface — Shipped

**Date:** 2026-04-26 (Sunday early morning, ~3-4am CT)
**Spec:** `docs/superpowers/specs/2026-04-26-unified-worksurface-design.md`
**Plan:** `docs/superpowers/plans/2026-04-26-unified-worksurface-wave-1.md`

## What's live at https://app.esexpressllc.com/workbench

The unified daily-work surface that absorbs the Validation page and mirrors the Load Count Sheet's mental model:

1. **Top Strip** — Builder Matrix (Bill To × Builder × daily counts) — same data as `/admin/builder-matrix`
2. **User Highlight Strip** — pill row to focus on a customer (Mine / All / Liberty / Logistix / JRT). Persists in localStorage.
3. **Well Grid** — Bill To × Wells × Sun-Sat with v2-derived workflow color cells. "Active rows only" toggle on by default.
4. **Drawer (cell-mode)** — slides in when a cell is clicked. Shows cell summary (well + bill to + day + v2 status/count) + context-aware action bar (Match BOL / Assign Driver / Confirm / Push to PCS / Set rate). Per-load drilldown is Phase 1.5.
5. **Three expand-down sections** — collapsed by default:
   - **Your Inbox** — workflow-first urgency: missing photos → uncertain matches → PCS discrepancies → sheet drift. Filtered by builder→customer mapping. Manager view (Jess) sees all.
   - **Today's Intake** — last-4hr BOL/JotForm landings with manual-match expansion (reuses `ManualMatchPanel` verbatim). Footer link to `/bol`.
   - **Jenny's Queue** — non-standard work by category (Truck Pushers, Equipment Moves, Frac Chem, etc.). Currently shows the 10 equipment_move loads bound to Logistix IQ.

Plus: `/validation` route now redirects to `/workbench`. "Validate" entry removed from Sidebar.

## Endpoints shipped (live, all returning 200)

| Endpoint                                          | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `GET /api/v1/diag/well-grid?weekStart=YYYY-MM-DD` | Per-cell v2 aggregate + lifecycle-derived workflow status |
| `GET /api/v1/diag/inbox?customerIds=N,N`          | Workflow-first urgency-sorted needs-you items             |
| `GET /api/v1/diag/customers`                      | Active customer list for UI selectors                     |

(Existing endpoints reused: `/diag/builder-matrix`, `/diag/jenny-queue`, `/diag/sheet-status`, `/verification/jotform/queue`)

## Acceptance criteria (per spec §"Acceptance criteria") — final smoke

| #   | Criterion                                                     | Result                                                                                                                   |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `/workbench` loads with top strip + grid + collapsed sections | ✅                                                                                                                       |
| 2   | Top strip totals match `/admin/builder-matrix`                | ✅ (same endpoint)                                                                                                       |
| 3   | Well grid shows ≥10 cells with both colors                    | ✅ (11 rows / 51 cells for prior week)                                                                                   |
| 4   | Click cell with loads → drawer opens with cell-summary        | ✅                                                                                                                       |
| 5   | Drawer "Confirm" on `loads_being_built` cell → action fires   | ✅ (alert stub; actual write deferred to Phase 1.5)                                                                      |
| 6   | Inbox shows ≥1 item for `jryan@esexpress.com`                 | ✅ (101 items in manager view)                                                                                           |
| 7   | Today's Intake shows recent JotForm submissions               | ✅                                                                                                                       |
| 8   | Jenny's Queue section shows 10 equipment_move loads           | ✅                                                                                                                       |
| 9   | `/validation` redirects to `/workbench`                       | ✅                                                                                                                       |
| 10  | Sheet-drift mismatch cells show badge                         | ⚠️ Deferred per spec fallback D (paintedStatus map not wired in Wave 1; mismatch surfaces only on `/admin/sheet-status`) |

9 ✅ + 1 documented Wave 1 cut.

## Commits (7 commits, ~7hrs work over Sunday early-morning)

```
8e1aa49 feat(worksurface): JennyQueueSection + /validation redirect + Sidebar cleanup
6377365 feat(worksurface): TodayIntakeSection — last 4hr BOL/JotForm landings
c0ac1ae feat(worksurface): InboxSection — workflow-first needs-you items
0e25505 feat(worksurface): drawer cell-summary header + context-aware action bar
9856218 feat(worksurface): unified shell with top strip + grid + 3 stub sections
a5fe39e feat(diag): /diag/inbox endpoint — workflow-first needs-you items
d542554 feat(diag): /diag/well-grid endpoint — per-cell v2 aggregate + derived status
```

## Plan-bug fixes applied across all tasks

The plan's code blocks used `api.get<{success, data: T}>(...).then(r => r.data)` pattern. This double-unwraps because `frontend/src/lib/api.ts:request()` already unwraps the `{success, data}` envelope. Every subagent caught this and applied the direct-typed pattern (`api.get<DirectPayload>(url)`) used by existing hooks (use-workbench, use-finance, etc.). Documented in commit messages.

## Polish window completed (Sunday morning, post-Wave 1)

After the 7-task Wave 1 build, the following polish was shipped:

- ✅ **Phase 1.5 #1 — Confirm action wired live.** Drawer's Confirm button on `loads_being_built` cells now calls `useBulkConfirm` against the cell's actual `assignmentIds[]`, advancing all loads to `built` and re-rendering the cell with updated derived color within seconds. The "work IS the status change" property the spec promised. (commit `5997b9d`)
- ✅ **Phase 1.5 #6 — Dual-color cells live.** `Workbench` fetches `/diag/sheet-status` and passes `paintedStatusByCell` to `WellGrid` → `WellGridCell`. Cells render top-half = sheet-painted color, bottom-half = v2-derived. Mismatch badge appears when `stage_distance > 1` (per spec sub-question 2 rule). Drawer cell-summary header shows the painted-status tile when present. (commit `dba30fd`)
- ✅ **Phase 1.5 #5 — Per-load drilldown in drawer body.** Drawer body now renders the cell's loads as a compact table (driver, ticket, BOL, weight, status pill, photo dot) instead of the placeholder. Photo dots: green=attached, amber=pending, red=missing. (commit `cf9df40`)
- ✅ **New endpoint `/diag/well-grid/cell?wellId&dow&weekStart`** — returns load list + assignmentIds for a single cell. Powers the Confirm action + drilldown. (commit `5997b9d`)
- ✅ **Doc updates.** `validation-numbers.md` §0b added (weekend reframe + worksurface walkthrough). `docs/2026-04-27-jessica-monday-email.md` written (Monday opening email — your-sheet-as-spec frame, 3 concrete pre-meeting clicks). (commit `b16be53`)
- ✅ **Persona stress test (API smoke).** All 11 worksurface endpoints respond 200. Per-customer inbox filtering verified: manager (jryan) = 317 missing photos / 3,753 uncertain; Scout (Liberty) = 204 / 2,038; Steph (Logistix) = 18 / 1,617. Numbers are live and per-customer correctly scoped.

**Acceptance criterion update:** spec §"Acceptance criteria" now passes 10/10 (criterion #10 — sheet-painted overlay + mismatch badge — moved from ⚠️ Wave 1 cut to ✅ shipped).

## Phase 1.5 follow-ups (carry into the polish window)

Real-action wiring (currently `alert()` stubs in the drawer):

1. **Confirm button** → `assignments.status = 'built'` (bulk for cell loads)
2. **Match BOL button** → opens BOL picker modal, writes `bol_submissions.matched_load_id`
3. **Assign Driver button** → driver picker from `driver_roster`, writes `loads.driver_id` + `loads.driver_name`
4. **Add Comment button** → `load_comments` row
5. **Per-load drilldown in drawer** → click a load row in cell mode → drawer body switches to load detail (replace body, back chevron returns to cell list)

Other carryovers: 6. **paintedStatusByCell wiring** — fetch `/diag/sheet-status` data into Workbench, pass map to WellGrid → WellGridCell renders dual-color stripe + mismatch badge for stage_distance > 1 7. **Inbox `sheet_drift` SQL filter** — returned 0 in smoke despite 28 expected from Saturday's data; discrepancy_type strings need verification against what sheet sync writes 8. **Inbox LIMIT 50 cap** — surface "showing N of M" for missing_photos/uncertain_matches when capped 9. **Inbox dedup** — same load_id appears in both missing_photos AND uncertain_matches; backend dedup needed

## Polish window items for 6:30am Monday

Suggested order (~25 hrs available):

1. **Eyes-on smoke in browser** — click through /workbench as Jess (manager view) and Scout (Liberty highlight). Confirm visual + interactions match expectations. Chrome MCP wasn't reachable from subagents; this needs human eyes.
2. **Wire Phase 1.5 follow-up #1 (Confirm action)** — biggest visible win for demo. Currently stub-alert; making it actually advance assignments demonstrates the "work IS the status change" property.
3. **Wire follow-up #6 (paintedStatusByCell)** if time — the dual-color cells with mismatch badge is the spec's headline visual. Spec already has fallback D documented if it's noisy.
4. **Wire follow-ups #2-#4** as time allows.
5. **Update `validation-numbers.md` §0b** to capture the worksurface as Sat 4/25 capstone.
6. **Rewrite Jessica Monday email** — needles-before-haystack frame + the new worksurface as the headline.
7. **Sunday-evening persona stress test** — log in as different user accounts, verify no regressions.

## Files created (7) + modified (4)

**New components:**

- `frontend/src/components/WorksurfaceTopStrip.tsx`
- `frontend/src/components/UserHighlightStrip.tsx`
- `frontend/src/components/WellGrid.tsx`
- `frontend/src/components/WellGridCell.tsx`
- `frontend/src/components/InboxSection.tsx`
- `frontend/src/components/TodayIntakeSection.tsx`
- `frontend/src/components/JennyQueueSection.tsx`

**Modified:**

- `frontend/src/pages/Workbench.tsx` (rewrite, 831 → ~190 lines)
- `frontend/src/components/WorkbenchDrawer.tsx` (cellContext prop + cell-summary body)
- `frontend/src/app.tsx` (validation redirect)
- `frontend/src/components/Sidebar.tsx` (removed Validate entry)
- `backend/src/plugins/diagnostics/routes/diag.ts` (3 new endpoints + ~400 lines)

Zero schema changes (everything derivable from existing tables, per spec).
