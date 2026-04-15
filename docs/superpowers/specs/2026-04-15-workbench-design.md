# Workbench — Design Spec

**Date:** 2026-04-15
**Prepared by:** Jace Ryan
**Status:** Design approved, ready for implementation plan
**Supersedes:** validation page, BOL queue page, dispatch desk as daily workflow surface

---

## Purpose

Replace the three-surface UI (Validation + BOL Queue + Dispatch Desk) and the team's spreadsheet-as-workflow-tool with **one shared workbench** that every dispatcher uses, filtered by what they're working on.

The design follows the 4-person chain the ES Express team actually runs (Ingest → Validate → Build → Dispatch → Clear → Settlement), using color stripes to signal whose turn a load is on — the same protocol they already use in Google Sheets, rendered in a UI that replaces the sheet.

## Why one surface

Stephanie's workflow session (2026-02-04) and Jessica's validation walkthrough (2026-04-06) and the 2026-04-15 feedback call all converge on the same point: the team thinks of their work as one unified flow, not four separate pages. When we split the UI by backend domain (validation vs BOL vs dispatch), we forced the team to hold a mental map between their single job and our schema. They chose to keep using the spreadsheet because it was one surface instead of three.

One surface also means we stop designing role-specific UIs with incomplete data about each role. If Katie's workflow turns out to differ from my model, the fix is a changed action on one stage, not a re-architected page.

---

## Architecture

### Single page: **Workbench**

Served at `/workbench` (default landing for authenticated users). Replaces `/dispatch-desk`, `/validation`, `/bol`.

**Layout:**

- **Top bar:** page title + inline search + filter pills + current-user color dot
- **Filter row:** Uncertain · Ready to Build · Mine · Ready to Clear · Entered Today · All
- **Row list:** the core work surface
- **Row expansion:** click a row → drawer expands in place with full detail + photos
- **Batch bar (when rows selected):** bulk actions (build+duplicate batch, mark batch entered, mark batch cleared)

### The Row (the fundamental unit)

Grid columns, left to right:

```
[checkbox] [color-stripe 4px] [phase-badges] [load#] [driver/carrier]
[BOL/ticket] [weight] [photo-thumb] [stage-pill] [contextual-action]
```

| Element                      | What it signals                                                                | Data source                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Checkbox                     | Select for batch                                                               | —                                                                  |
| Color stripe (4px left edge) | Whose turn this load is                                                        | `assignments.current_handler_id` → `users.color`                   |
| Phase badges                 | Pickup state + Delivery state                                                  | New `loads.pickup_state` + `loads.delivery_state` (see Data Model) |
| Stage pill                   | Where in the chain (Uncertain / Ready to Build / Building / Entered / Cleared) | `assignments.handler_stage`                                        |
| Photo thumb                  | Attached photo, or awaiting-sync icon, or no-photo icon                        | `photoStatus` + `photoUrls` already available                      |
| Contextual action            | The ONE primary action for this load's current stage                           | Derived from `handler_stage`                                       |

### Contextual actions by stage

| Stage              | Primary action                                                                                                                                                                                                                                                                                        | Secondary actions         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Uncertain**      | `Resolve` — opens fix modal matching trigger (pick well, pick match, edit BOL, attach photo, enter rate, confirm weight)                                                                                                                                                                              | —                         |
| **Ready to Build** | `Build + duplicate N` — **Stephanie's core action.** Opens batch duplicator: "make this a template, create 1+N loads with [these variations]." Pre-OAuth: copies the batch into PCS-paste-ready format. Post-OAuth: pushes batch to PCS via REST. On success, stage → Building, color → whoever built | Build single, edit fields |
| **Building**       | `Mark Entered` — Steph/Scout signals they typed it into PCS. Stage → Entered, color stripe → Katie's color. Katie sees it appear on her Ready to Clear filter.                                                                                                                                        | Cancel build, edit fields |
| **Entered**        | `Mark Cleared` (Katie-role only) — she's verified the load in PCS. Stage → Cleared, color stripe → neutral. Terminal state pre-settlement.                                                                                                                                                            | Flag back to Jess         |
| **Cleared**        | none (terminal, read-only — settlement is post-OAuth scope)                                                                                                                                                                                                                                           | —                         |

### Filters — which rows appear

Each filter is a query on `handler_stage` + `current_handler_id`:

| Filter             | Query                                                         |
| ------------------ | ------------------------------------------------------------- |
| **Uncertain**      | handler_stage = 'uncertain' — any of 6 triggers fired         |
| **Ready to Build** | handler_stage = 'ready_to_build'                              |
| **Mine**           | current_handler_id = current user                             |
| **Ready to Clear** | handler_stage = 'entered'                                     |
| **Entered Today**  | handler_stage IN ('entered','cleared') AND entered_on = today |
| **All**            | no filter                                                     |

Plus inline search across BOL, driver, ticket, load#, truck.

### The six Uncertain triggers

Any of these on a load marks it `handler_stage = 'uncertain'` and puts it on Jessica's sweep surface:

1. **Unassigned well** — auto-mapper couldn't resolve destination
2. **Fuzzy match only** — photo matched via driver+date+weight, not exact BOL
3. **BOL mismatch** — photo BOL and load BOL disagree on last-4
4. **Weight mismatch** — photo-OCR weight differs from load weight by >5%
5. **No photo at 48h+ past delivery** — driver likely never submitted
6. **Rate missing** — load has no rate set (required for settlement)

When Jessica resolves a trigger, the trigger clears. When all triggers clear, stage advances to `ready_to_build`.

---

## Data model

### New columns on `assignments`

```sql
ALTER TABLE assignments
  ADD COLUMN handler_stage text NOT NULL DEFAULT 'uncertain',
  ADD COLUMN current_handler_id integer REFERENCES users(id),
  ADD COLUMN uncertain_reasons jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN stage_changed_at timestamp with time zone DEFAULT now(),
  ADD COLUMN entered_on date;
```

- `handler_stage` enum values: `uncertain | ready_to_build | building | entered | cleared`
- `uncertain_reasons` is an array of the triggers firing for this load; used to render specific "Resolve" modals
- `current_handler_id` drives the color stripe — null means no one claimed yet (shows neutral stripe)
- `stage_changed_at` enables the "Entered Today" filter via `entered_on`

### New columns on `loads`

```sql
ALTER TABLE loads
  ADD COLUMN pickup_state text,
  ADD COLUMN delivery_state text;
```

Enum values: `pending | in_progress | complete` for each. Drives the phase badge rendering. Populated from PropX raw_data on sync (fields already exist in the raw).

### No changes to

- Ingestion services (PropX, Logistiq, JotForm syncs unchanged)
- Matcher (already feeds the data the Uncertain triggers consume)
- Reconciliation (runs on ingest, flags go into `uncertain_reasons`)
- Feedback loop (existing `wells.match_feedback` + `original_ocr_bol_no` keep working)

---

## Data flow

```
PropX/Logistiq/JotForm sync → loads + jotform_imports rows
                            ↓
            Matcher runs (Tier 1/2/3)
                            ↓
            Reconciliation runs (6 triggers)
                            ↓
            assignments row created with:
              handler_stage = 'uncertain' (if any trigger fires)
              handler_stage = 'ready_to_build' (if clean)
              uncertain_reasons = [list of triggers]
                            ↓
            User picks filter on Workbench
                            ↓
            Rows rendered with color stripe + phase badges + contextual action
                            ↓
            User clicks action → handler_stage advances
                            ↓
            current_handler_id rotates to next role
                            ↓
            Loop until handler_stage = 'entered'
```

Transitions are stored. Audit is a query over `stage_changed_at` history (via `status_history` table that already exists).

---

## Onboarding walkthrough (first login)

On each user's first login after v5 ships, show a 60-second walk-through overlay. One for each role.

### Mechanism

- localStorage key `workbench_onboarding_v5_seen` = `true` on completion
- Skippable (top-right "Skip")
- Can be re-triggered from user menu → "Show walkthrough"

### Content per role

Each walkthrough is a sequence of spotlighted DOM elements with a tooltip beside each.

**Jessica's walkthrough (5 steps):**

1. "Good morning. Today you have {N} uncertain loads — these are the only ones that need you." _(highlights Uncertain filter)_
2. "Click a row to resolve. Each one shows you exactly why it's on your list — missing well, weight mismatch, no photo, etc." _(highlights first Uncertain row)_
3. "When you resolve, it moves to Ready to Build. Your team sees it next." _(highlights stage pill on another row)_
4. "Your color stripe is green. When you see green, it's on your plate. Other colors mean it's someone else's turn." _(highlights color stripe)_
5. "When you're done with the Uncertain list, the day's done for you. The team takes over from there." _(highlights Entered Today)_

**Stephanie's (and Scout's) walkthrough (5 steps):**

1. "Open 'Ready to Build' — these are the loads Jessica released to you." _(highlights filter)_
2. "Click any row. Then **Build + Duplicate** — same pattern you use in PCS, faster." _(highlights Build+Duplicate button)_
3. "Select multiple loads first? Batch duplicate — build the template once, duplicate for every load on the well." _(highlights batch bar)_
4. "j and k to navigate. Enter to build. Shift+E to mark entered. Your mouse stays on the desk." _(highlights keyboard hint)_
5. "Your color stripe is blue. When you've typed a load into PCS, hit Mark Entered. Stripe turns teal — Katie's color — and she knows to verify it next." _(highlights color transitions)_

**Katie's walkthrough (4 steps):**

1. "Open 'Ready to Clear' — loads Steph or Scout built, now in PCS, ready for you to verify." _(highlights filter)_
2. "Each row shows the PCS load number so you can pull it up directly. No hunting." _(highlights load# column)_
3. "When verified, click Mark Cleared. Jenny takes it for settlement." _(highlights Mark Cleared)_
4. "Flag any load back to Jessica if something's off — she sees it on her Uncertain list immediately." _(highlights flag button)_

### Why walkthrough matters here

The team has been using spreadsheets for years. We're asking them to abandon a tool they know for one they don't. An explicit guided first-login teaches the color protocol, the filter model, and their role in under 60 seconds. Not optional for adoption — they need to see the "this is your flow" moment.

---

## Retirement + migration

### What's retired

| Page             | Action                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `/validation`    | redirects to `/workbench?filter=uncertain`                                                             |
| `/bol`           | redirects to `/workbench?filter=uncertain` (unmatched photos surface as "needs photo lookup" triggers) |
| `/dispatch-desk` | redirects to `/workbench`. Dispatch Desk URL preserved for bookmarks.                                  |

### Backend endpoints

All existing endpoints stay. No deprecations. New endpoint `GET /dispatch/workbench` returns the unified row list with filter params. Old endpoints (`/dispatch/validation/tier/:n`, `/verification/jotform/queue`) remain available for debug/admin but frontend no longer consumes them.

### Data migration

Single migration advances existing `assignments` to v5 states:

```sql
-- Loads without assignments → uncertain with 'unassigned_well' reason
-- Loads with pending assignments → uncertain or ready_to_build based on existing auto_map_tier + photo_status
-- Loads with dispatch_ready/validated status → ready_to_build (team re-does the build step on v5 for clean state)
```

Backfill strategy spelled out in implementation plan.

---

## Explicit non-goals

1. **Not building PCS push** — that's blocked on OAuth. "Build + Duplicate N" in this spec means prepare the batch + Copy Report. When OAuth lands, the action swaps for a REST push without UI change.
2. **Not building settlement UI** — Jenny's handler_stage slot is modeled in data (`cleared`, `entered`) but has no dedicated screens in v5.
3. **Not rebuilding ingest or matcher** — both stay as they are. Workbench consumes their output.
4. **Not building a chain-visibility dashboard** — Today's Objectives becomes a simple chain-stage count view, not a Kanban.
5. **Not building Vertex rule engine / JotForm-GCS pipeline** — those are post-call architecture plan phases 2-3, separate from v5.

---

## Success criteria

1. Jessica opens Workbench → sees the Uncertain filter has ≤20 loads to resolve → completes them in under 10 minutes.
2. Stephanie opens Workbench → Ready to Build filter → hits Build+Duplicate on a well, duplicates 12 loads in one action → time-to-built per load is <30s (vs ~4.5s already at dispatch-desk speed, but duplication is the key change).
3. Katie opens Workbench → Ready to Clear filter → can verify and mark cleared without leaving the page.
4. Jessica can reconcile the day's work by opening Entered Today filter and exporting to CSV for Mike.
5. Over 1 week, team uses Workbench for ≥80% of their daily dispatch work (measured by login-to-action telemetry).

---

## Risks + mitigations

| Risk                                                                      | Mitigation                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Katie's actual workflow doesn't match "Ready to Clear" filter as designed | Only one action on her stage; easy to change without rewriting a page                                                                                                                                      |
| Team resists leaving the spreadsheet                                      | Onboarding walkthrough + the phase + personal color systems reproduce her visual model                                                                                                                     |
| "Build + Duplicate N" doesn't match PCS's actual duplication quirks       | Pre-OAuth it's a Copy Report batch — worst case it's no worse than today. Post-OAuth is a separate implementation.                                                                                         |
| Data migration leaves stale loads in wrong stage                          | Migration is one-way but reversible via SQL; state transitions are logged                                                                                                                                  |
| Color stripe conflicts with existing LoadRow left-border-color            | LoadRow already uses left-border for Load Count Sheet status; new spec stacks these (4px status stripe + 4px handler stripe, or handler becomes a dot if space-constrained) — final call at implementation |

---

## Implementation plan (next step)

This spec will be handed to `writing-plans` for the detailed build plan. Expected scope:

- Backend: 1 migration, enhanced `/dispatch/workbench` endpoint, handler-stage transition handlers
- Frontend: new Workbench page, reused LoadRow with color-stripe extension, Build+Duplicate modal, 3 role-specific onboarding walkthroughs
- Data: migration script for existing assignments + loads
- Redirect setup: old URLs → new URLs
- Telemetry: log which filter is opened + which action is clicked, per user

Estimated: 5-7 focused engineering days, not counting any client signoff pause.

---

_This spec is the authoritative design. Questions or changes, edit this file; re-run brainstorming if the changes are structural._
