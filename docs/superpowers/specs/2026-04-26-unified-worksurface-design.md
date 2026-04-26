# Unified Worksurface — Design Spec

**Date:** 2026-04-26 (Sunday) | **Status:** Draft, brainstorm-approved | **Target ship:** Sunday evening for Monday demo | **Wave:** 1 of 2

---

## Problem statement

Tonight (2026-04-25 Saturday) we shipped 6 admin pages that prove v2 has the right read-only lens on the team's mental model: PCS Truth, Sheet Truth, Order of Invoicing, Jenny's Queue, Sheet Status, Cross-Check. Each mirrors a piece of the Load Count Sheet's structure with sheet-canonical labels.

But the operator surfaced the load-bearing concern: **"we created all this admin UI but if it doesn't translate to being workable or useful in the validate/bol-queue/load-report pages, it does nothing."**

The team's actual daily work happens in:

- `/workbench` (831 lines) — dispatch desk
- `/validation` (1,187 lines) — pre-build verification
- `/bol` (1,729 lines) — JotForm/PropX intake
- `/load-report` (391 lines) — historical lookup
- `/` (429 lines) — exception feed home

These were ported piecemeal from v1 ("here's the dispatch desk; here's the BOL queue") rather than designed around how the team thinks. After tonight's vocabulary work, we know the team's mental model is:

- **The painted Load Count Sheet** (well grid + Order of Invoicing matrix + Jenny's Queue + weekly notes)
- **Builder-routing** (Scout owns Liberty, Steph owns Logistix, Keli owns JRT, Crystal floats, Katie backs up Liberty, Jenny owns the sheet)
- **8-stage workflow status** painted into cell color (Missing Tickets → Missing Driver → Loads being built → Loads Completed → Loads Being cleared → Loads cleared → Export Completed → Invoiced)

The unified worksurface needs to **be the writable counterpart of those admin pages** — the place where actions translate to status changes, where the painted color updates because the underlying load lifecycle moved.

---

## Architecture (5 components)

### 1. Top Strip — Builder Matrix (compact)

A compact horizontal strip mirroring `/admin/builder-matrix` exactly:

```
Bill To       Builder | Sun  Mon  Tue  Wed  Thu  Fri  Sat | Total
Liberty       Scout   |  99  145  141  132  197  204  123 | 1,041
Logistix      Steph   | 167  187  132  105  119   56  148 |   914
JRT           Keli    |   0    0    0    0    0    0    0 |     0
(floater)     Crystal |   0    0    0    0    0    0    1 |     1
Liberty       Katie   |   0    0    0    0    0    0    0 |     0  (backup)
                                                           |─────────
                                                  Grand:   | 1,956
```

Always visible. Refreshes every 60s. Click a builder name → highlights their customer's rows in the well grid below. Reuses `/diag/builder-matrix` endpoint shipped 2026-04-25.

### 2. Main Canvas — Well Grid with dual-color cells

Bill To × Wells (rows) × Sun-Sat (cols). Each cell is a 40×28px tile rendering:

- **Cell value** (count for that well-day from v2): centered, large
- **Top half color stripe**: sheet-painted color (read from `sheet_well_status` via existing color sync)
- **Bottom half color stripe**: v2-derived color (computed every page load via the lifecycle rule below)
- **Mismatch indicator**: 8px badge in top-right corner if top ≠ bottom; click → flags as `sheet_status_drift` discrepancy
- **Click anywhere on cell** → drawer opens with loads for that (well, day)

Empty cells (no v2 loads) show as gray. If sheet has a color but v2 has zero loads → orange-bordered cell ("sheet says here, v2 doesn't see them yet").

Grid is the focal real estate of the page. Sticky horizontal scroll for many wells. Toggleable: **Filter to active rows only** (default on) hides wells with no activity this week.

### 3. Drawer (right-side slide-in) — extends WorkbenchDrawer

Replaces today's Validation page entirely (Wave 1) and partially absorbs BolQueue's per-load actions (Wave 2 takes the rest).

**Drawer header (per-cell):**

```
Apache-Warwick-Hayes · Liberty
Wednesday, April 23, 2026
Sheet: 12 (loads_being_built)        v2: 11 (loads_being_built)
Difference: -1 [click to flag]
```

**Drawer body — loads list** (existing WorkbenchRow style):

- Driver, ticket #, BOL #, weight, photo thumb, status pill, inline-edit pencils
- Each row clickable → in-drawer load detail (no nested drawer; replaces body)
- Per-load actions (route uncertain, edit fields) preserved from current Workbench/Validation

**Drawer action bar — context-aware** based on cell's v2-derived status:
| Cell status | Primary action button |
| --- | --- |
| `missing_tickets` | "Match BOL" → opens BOL picker (modal) |
| `missing_driver` | "Assign Driver" → driver picker from `driver_roster` |
| `loads_being_built` | "Confirm" → bulk-advances all matching loads to `built` |
| `loads_completed` | "Push to PCS" (gated by `PCS_DISPATCH_ENABLED` flag) |
| `loads_being_cleared` | (read-only, monitoring state) |
| `loads_cleared` | (read-only, awaiting invoice) |
| `invoiced` | (read-only, terminal) |
| any | "Add Comment" (per-cell), "Mark as Need Rate Info" (writes `cell_status_overrides`) |

The action bar text changes verbatim with the painted color. The work IS the status change — no separate "set status" UI.

### 4. Three Expand-Down Sections (collapsed by default)

Below the well grid, three collapsing sections. Default: all collapsed. State persisted in localStorage.

**Section A: Your Inbox**
Filtered by `builder_routing.builder_name = currentUser.name` → customer_id → loads. Items:

- Uncertain matches (assignment.status = `pending` AND no recent decision)
- Missing photos for delivered loads (>4hr since delivered_on)
- Sheet-drift cells in your customer (where sheet ≠ v2)
- JotForm pending submissions matching your customer
- PCS discrepancies on your loads

Sort by urgency: PCS discrepancies first (revenue at risk), then missing photos, then matches, then sheet drift. Click any → opens drawer for that load's cell.

Empty state: "Nothing needs you. Check the Today's Intake section for fresh BOL submissions."

For Jess: no customer filter (manager view). Sees ALL inbox items.
For Jenny: shows sheet-drift cells across ALL customers + Jenny's Queue items.

**Section B: Today's Intake**
Last 4hr BOL/JotForm landings. Each row:

- 60×60 photo thumb, driver name, BOL #, "→ matched to LOAD-12345" or "→ unmatched"
- Click matched → drawer opens for that load's cell
- Click unmatched → manual-match modal (existing BolQueue jotform-match logic, lifted into modal)

Auto-refreshes every 30s. Replaces today's BolQueue feel for the "what just landed?" question. The deeper BolQueue stays at `/bol` for Wave 2.

**Section C: Jenny's Queue**
Same shape as `/admin/jenny-queue` but actionable:

- Group by category (Truck Pushers, Equipment Moves, Frac Chem, Finoric, etc.)
- Each load row clickable → drawer (with category-aware fields, e.g. equipment-type field for Equipment Moves)
- Add load button → "New non-standard load" modal

Always visible to all builders (because the team thinks in builder-first, but Jenny's Queue is a separate work-stream they all touch).

### 5. User-Filter Highlight Strip (top of well grid, small)

Tiny pill row above the well grid:

```
[Mine] [All] [Liberty] [Logistix] [JRT] [Crystal floater]
```

- Default for builders: their customer's pill is active → rows for that customer are full-color, others dimmed to 40%.
- Toggle: "All" removes highlight (default for Jess).
- "Mine Only" actually filters out other rows (less common; for focus mode).

URL state: `/workbench?highlight=liberty` so links are shareable.

---

## Data Flow

### Read path (every page load)

| What                          | Endpoint                                                     | Refresh |
| ----------------------------- | ------------------------------------------------------------ | ------- |
| Builder Matrix top strip      | `GET /diag/builder-matrix?weekStart=...`                     | 60s     |
| Sheet-painted cells           | `GET /diag/sheet-status?weekStart=...&tab=Current`           | 5min    |
| v2-derived per-cell aggregate | NEW: `GET /diag/well-grid?weekStart=...`                     | 60s     |
| Inbox items                   | NEW: `GET /diag/inbox?customerIds=...`                       | 30s     |
| Today's Intake                | `GET /verification/jotform/recent?hours=4` (extend existing) | 30s     |
| Jenny's Queue                 | `GET /diag/jenny-queue` (existing)                           | 60s     |

### Write path (drawer actions)

All actions write to v2's load tables directly. The cell color updates next render because the rule reads from `assignments.status / photo_status / pcs_dispatch.cleared_at / pcs_invoice.status`.

| Drawer action          | Writes to                                                                  |
| ---------------------- | -------------------------------------------------------------------------- |
| Confirm                | `assignments.status = 'built'` (bulk for cell loads)                       |
| Match BOL              | `bol_submissions.matched_load_id`, `assignments.photo_status = 'attached'` |
| Assign Driver          | `loads.driver_id`, `loads.driver_name`                                     |
| Push to PCS            | `pcs_dispatch` row, gated by feature flag                                  |
| Add Comment            | `load_comments` row                                                        |
| Mark as Need Rate Info | `cell_status_overrides` row                                                |
| Inline edit field      | `loads.<field>` direct                                                     |
| Route uncertain        | `assignments.status = 'flagged'` + `match_decisions` row                   |

### Sheet sync (read continues; write deferred to Wave 2)

Phase 1 (this Wave): v2 reads sheet color every 30 min. Display BOTH sheet-painted and v2-derived alongside on each cell. Mismatches naturally surface as discrepancies.

Phase 2 (post-Monday): wire v2 → sheet color writeback so Jess sees v2's calls in her sheet view. Captured as separate Wave 2 work.

Phase 3 (when team trusts): writeback stops, sheet becomes view-only legacy.

---

## Lifecycle → Computed Color Rule

For each cell `(well, day)`:

```
loads_in_cell = SELECT loads WHERE
  assignment.well_id = this well
  AND delivered_on::date = this day (in America/Chicago)

if loads_in_cell is empty → no color (gray)
if cell_status_overrides has matching row → use override.status
else "laggard wins" (the latest stage ALL loads have reached):
  if any load has photo_status = 'missing' → 'missing_tickets'
  elif any load has driver_name IS NULL → 'missing_driver'
  elif any load has assignment.status = 'pending' → 'loads_being_built'
  elif any load has assignment.status = 'built' AND no pcs_dispatch row → 'loads_completed'
  elif any load has pcs_dispatch row AND cleared_at IS NULL → 'loads_being_cleared'
  elif any load has cleared_at NOT NULL AND no invoice → 'loads_cleared'
  elif all loads have pcs_invoice.status IN ('paid','open') → 'invoiced'
  elif loads on transfer track → 'export_transfers_completed'
  else → 'unknown' (rare; usually means computed-color is uncertain)
```

The rule is wrong on day 1 in places. The dual-color split-cell visualization makes EACH mismatch a clickable discrepancy. Refine the rule with Jess over week 1 by walking through the discrepancy queue.

---

## Schema additions (small, additive only)

**New table: `cell_status_overrides`**

```sql
CREATE TABLE cell_status_overrides (
  id serial PRIMARY KEY,
  well_id integer NOT NULL REFERENCES wells(id),
  week_start date NOT NULL,
  dow integer NOT NULL CHECK (dow BETWEEN 0 AND 6),
  status text NOT NULL,
  reason text,
  set_by_user_id integer REFERENCES users(id),
  set_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (well_id, week_start, dow)
);
```

No other schema changes. The lifecycle rule uses existing columns.

---

## URL & state

```
/workbench                              — default (your customer highlighted, today's week)
/workbench?week=2026-04-12              — historical week
/workbench?highlight=liberty            — explicit highlight
/workbench?filter=mine_only             — filter to your customer
/workbench?cell=well-78-day-3           — deep-link to drawer open
/workbench?inbox=open                   — Inbox section expanded
```

All state in URL so links are shareable + browser back/forward works.

---

## Out of Scope (Wave 1 — explicit cuts)

- BolQueue absorption — Wave 2 (one week post-Monday)
- v2 → sheet color writeback — Wave 2
- LoadReport changes — stays at `/load-report` (historical lookup unchanged)
- Per-week notes write-back to sheet — read-only on /admin/sheet-truth for now
- Mobile / responsive — desktop only (1280px+)
- Per-load builder reassignment — uses customer's primary builder by default
- New Inbox sort orders — fixed urgency-based sort for v1
- Multi-select bulk actions on the well grid — single-cell drawer for now
- Drag-to-paint workflow status — can't replicate sheet's painting UX in v1; manual override button only

---

## Acceptance criteria

Wave 1 ships when ALL of the following pass on Sunday evening:

1. `/workbench` loads the unified surface with top strip + grid + collapsed sections
2. Top strip numbers match `/admin/builder-matrix` exactly
3. Well grid shows ≥10 cells with both sheet-painted and v2-derived colors
4. Click on a cell with loads → drawer opens with those loads
5. Drawer "Confirm" button on a `loads_being_built` cell → advances loads, cell re-renders within 5s with updated color
6. Inbox section for `jryan@esexpress.com` (admin) shows ≥1 item
7. Today's Intake shows the most-recent JotForm submission
8. Jenny's Queue section shows the 10 equipment_move loads
9. `/validation` route redirects to `/workbench` (with appropriate filter)
10. Sheet-drift mismatch cells show the badge and click → opens discrepancy

---

## Sunday Build Sequence (8 steps, ~14 hrs estimated)

| #   | Step                                                                                                                | Estimate | Dependencies |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------: | ------------ |
| 1   | Schema migration: `cell_status_overrides` table                                                                     |    30min | None         |
| 2   | NEW endpoint `GET /diag/well-grid?week=...` — computes per-cell v2 aggregate + lifecycle-derived color              |      2hr | #1           |
| 3   | NEW endpoint `GET /diag/inbox?customerIds=...` — pulls "needs you" items per builder's customer                     |    1.5hr | None         |
| 4   | Frontend: rewrite `Workbench.tsx` shell — top strip + well grid + drawer mount points + URL state                   |      3hr | #2           |
| 5   | Frontend: extend `WorkbenchDrawer.tsx` — context-aware action bar based on cell status; cell-summary header         |      2hr | #4           |
| 6   | Frontend: Inbox section component (filter by builder→customer; urgency sort)                                        |    1.5hr | #3           |
| 7   | Frontend: Today's Intake section (lift BolQueue's recent-feed query into a card list + manual-match modal)          |      2hr | #4           |
| 8   | Frontend: Jenny's Queue section (reuse existing endpoint; drawer link); user-filter highlight strip; route redirect |    1.5hr | #4           |

Total: ~14hr. With ~30hr until Monday morning that's a ~2x safety buffer.

---

## Risk register

| Risk                                                           | Likelihood | Mitigation                                                                        |
| -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| Lifecycle rule wrong → many false-positive mismatches on day 1 | High       | Dual-color visualization makes mismatches a feature; refine rule with Jess week 1 |
| Drawer becomes too heavy (loads of action context)             | Medium     | Cap drawer body at scrollable; defer secondary actions to existing modal patterns |
| User filter highlight confuses Jess (manager view)             | Low        | Default to "All" for Jess; per-user persistence in localStorage                   |
| BolQueue absorption deferred → Today's Intake feels thin       | Medium     | Surface explicit "see all in BolQueue →" link from Intake section                 |
| Sunday build slips past 14hr estimate                          | Medium     | Wave 1 explicit cuts (above) are non-negotiable scope reductions if needed        |
| Page performance on 100+ wells × 7 days = 700-cell grid        | Low        | Virtualized rows already in workbench pattern; well filter on by default          |

---

## Wave 2 preview (post-Monday week)

Captured here so it doesn't surface as scope creep on Sunday:

- Absorb BolQueue (1,729 lines) — JotForm + PropX manual-match flows fold into drawer + Today's Intake section
- v2 → sheet color writeback — Jess's sheet shows v2's lifecycle-derived calls
- Sheet-color discrepancy auto-surface in `/admin/discrepancies`
- Per-week notes editable in v2 (write back to sheet's Notes section)
- LoadReport gets a "your customer's history" filter using customer FK
- Mobile/responsive pass for handheld dispatch use

---

## Open questions to validate Sunday morning

Before kickoff, walk these through with operator (15 min):

1. Drawer's per-load detail view — replace drawer body or open nested? (current spec: replace body, no nested)
2. Inbox urgency order — confirm PCS discrepancy first, then photos, then matches, then drift (or different order?)
3. "Mark as Need Rate Info" — does this just paint the cell, or does it also surface in Inbox for Jess to action?
4. Should the user filter highlight persist across sessions or reset to default each login?
5. Wave 2 BolQueue migration — fold into Today's Intake section or build a separate "BOL Center" expand?

---

## Files to create / modify

### New files

- `backend/src/db/migrations/0029_cell_status_overrides.sql`
- `backend/src/db/schema.ts` — append `cellStatusOverrides` table + relevant types
- `backend/src/plugins/diagnostics/routes/diag.ts` — append `/well-grid` and `/inbox` endpoints
- `frontend/src/components/WellGrid.tsx` — new component
- `frontend/src/components/WellGridCell.tsx` — dual-color cell renderer
- `frontend/src/components/UserHighlightStrip.tsx` — filter pills
- `frontend/src/components/InboxSection.tsx`
- `frontend/src/components/TodayIntakeSection.tsx`
- `frontend/src/components/JennyQueueSection.tsx` (page-component → embeddable component)

### Modified files

- `frontend/src/pages/Workbench.tsx` — full rewrite to embed top strip + grid + sections
- `frontend/src/components/WorkbenchDrawer.tsx` — extended with context-aware action bar + cell summary
- `frontend/src/app.tsx` — `/validation` route redirects to `/workbench?filter=needs_validation`
- `frontend/src/components/Sidebar.tsx` — remove "Validate" entry; rename "Workbench" to whatever (probably "Today" or "Worksurface")

### Files to leave alone (Wave 1)

- `frontend/src/pages/BolQueue.tsx` — Wave 2
- `frontend/src/pages/LoadReport.tsx` — unchanged
- `frontend/src/pages/ExceptionFeed.tsx` — stays as `/` home; gets a "Open Today's Worksurface" CTA

---

## Related

- `docs/2026-04-25-canonical-vocabulary.md` — the 14 roles + sheet-canonical labels this design uses
- `docs/2026-04-25-load-count-sheet-analysis.md` — sheet structure deep dive
- `docs/superpowers/specs/2026-04-15-workbench-design.md` — earlier Workbench spec (will be partially superseded)
- `docs/superpowers/specs/2026-04-02-validation-editing-pagination-design.md` — Validation page spec (page itself goes away in Wave 1)
