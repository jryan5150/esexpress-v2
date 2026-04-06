# Stephanie Round 2 Report

**Date:** 2026-04-06
**Tested via:** code review only (Chrome DevTools unreachable from this agent — `ws://172.17.96.1:9222` refused connection; other personas had the live browser)

Real talk up front: most of the cosmetic stuff you fixed looks good in code. Most of the speed stuff I actually asked for is still missing. I lost Round 1's sleep over keyboard nav and I'm still losing it in Round 2. Let's go.

## Verified Fixes from Round 1

| #   | Fix                                                       | Status         | Notes                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Login monogram "Es" + ghosted "Express" breathing         | `[ok]`         | `Login.tsx` `GhostTitle` component — stagger fade-in then randomized per-letter opacity breathing. Hover boost works.                                                                                                           |
| 2   | Sidebar matches login branding                            | `[not tested]` | Didn't open Sidebar.tsx; out of my scope as speed builder.                                                                                                                                                                      |
| 3   | Wells / Loads toggle + pagination                         | `[ok]`         | `DispatchDesk.tsx:634-689` toggle, `Pagination.tsx` has 25/50/100/200.                                                                                                                                                          |
| 4   | Select All checkbox in column headers                     | `[ok]`         | `DispatchDesk.tsx:896-914` (loads view) and `:1027-1044` (well-filtered view). Both wired.                                                                                                                                      |
| 5   | Individual checkboxes stopPropagation                     | `[ok]`         | `LoadRow.tsx:119-122` `e.stopPropagation()` guards the row click.                                                                                                                                                               |
| 6   | Filter tabs human labels ("Ready to Build", "BOL Issues") | `[caveat]`     | `FilterTabs.tsx:17-25` labels are right — BUT `className="... capitalize whitespace-nowrap ..."` on line 38 force-capitalizes each word, turning "BOL Issues" into "Bol Issues". Browser needed to verify — likely reads wrong. |
| 7   | "Mark Entered" button with checkmark icon                 | `[ok]`         | `LoadRow.tsx:252-262` — `check_circle` icon + "Entered" label, replaces old "Copy". My #1 complaint fixed on the cosmetic front.                                                                                                |
| 8   | "Photo BOL" label                                         | `[partial]`    | Renamed in `ExpandDrawer.tsx:428` (`Photo BOL: ...${jotLast4}`). BUT `BolQueue.tsx` still has 5 occurrences of "JotForm Submissions" in titles, labels, and empty states (lines 86, 108, 238, 410, 429). Rename is half done.   |
| 9   | Trailer # + Delivered Date inline-editable                | `[ok]`         | `ExpandDrawer.tsx:374-379` (trailerNo), `:454-465` (delivered w/ `inputType="date"`).                                                                                                                                           |
| 10  | Photo thumbnail h-48 + click-to-zoom                      | `[ok]`         | `ExpandDrawer.tsx:289-297` — `h-48 object-cover ... cursor-zoom-in` opens full size in new tab.                                                                                                                                 |
| 11  | Validation page inline editing                            | `[not tested]` | Out of my hot path. Jessica's agent covers it.                                                                                                                                                                                  |
| 12  | PCS Start # tooltip                                       | `[ok]`         | `DispatchDesk.tsx:504` `title="The starting sequence number in PCS..."`.                                                                                                                                                        |
| 13  | validateFromSheet `"matched"` bug                         | `[ok]`         | No "matched" string found in frontend. Backend fix not verified from this seat.                                                                                                                                                 |
| 14  | Date filter page-level, empty default                     | `[ok]`         | `DispatchDesk.tsx:43` `useState("")` and `:430-443` in the header.                                                                                                                                                              |

## Still Open from Round 1 (Speed Killers)

- **Keyboard navigation between loads — STILL OPEN (zero progress).** Grepped `frontend/src` for `ArrowDown|ArrowUp|KeyJ|KeyK|useHotkey`. Only hit: `PhotoModal.tsx:119,122` for navigating photos within a single modal, and `SearchOverlay.tsx:16` for Cmd+K to open global search. There is no J/K, no arrow keys, no Tab-to-next-row, no auto-expand. The only dispatch-desk shortcuts are `Shift+A` (approve all), `Shift+E` (mark all entered), `Shift+V` (validate selected), `Escape` (clear selection). See `DispatchDesk.tsx:355-404`. These are BULK shortcuts. I need ROW shortcuts. I still have to mouse from row to row all day long.
- **Flag for Jessica — STILL OPEN.** `PhotoModal.tsx:20,103,345-352` has an `onFlag` prop with a "Flag Issue" button, but it's never passed from `DispatchDesk.tsx:1193` (I grepped — the only `onFlag` references are the PhotoModal component itself, never a caller). It's dead code. No flag button ever renders. No other flagging UI exists anywhere. I still have to text her.
- **"Missing Ticket" button is DEAD — STILL OPEN.** `LoadRow.tsx:277-281`:
  ```tsx
  <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-error/25 text-[10px] font-bold uppercase tracking-wide text-error hover:bg-error/5 transition-all cursor-pointer">
    <span className="material-symbols-outlined text-sm">report</span>
    Missing Ticket
  </button>
  ```
  NO `onClick`. Looks like a button, clicks like a button, does nothing. Was dead in Round 1, still dead in Round 2. This is embarrassing.
- **Entered count resets on refresh — STILL OPEN.** `DispatchDesk.tsx:36` `const [enteredIds, setEnteredIds] = useState<Set<number>>(new Set());` — pure React state. No `localStorage`, no server persistence. Grepped `localStorage.*entered|persist.*entered` — zero hits. Also: because `useMarkEntered` invalidates queries and the backend now returns those loads with `assignmentStatus === "dispatched"`, after a refetch my local `enteredIds` set contains ghost IDs that aren't in `allLoads` anymore, which means the "Completion Summary" condition at `DispatchDesk.tsx:1234-1235` relies on a fragile math tautology (`enteredIds.size === readyLoads.length + enteredIds.size` — only ever true because `readyLoads` already filters out entered ones). Works in the happy path, but any refresh zeros the counter while the banner stays broken logic.
- **Cross-well daily summary — STILL OPEN.** The closest thing I see is the "Today's Objectives" summary card at `DispatchDesk.tsx:747-774`, which aggregates `withTargets.reduce((s, w) => s + w.totalLoads, 0)`. That's total loads across wells with targets — NOT "loads Stephanie built today". There's no per-user counter, no "94 built by you today" number. Still no way to say "I crushed it today" to my boss without doing the math myself.

## NEW Issues (HIGHEST PRIORITY)

### 1. FilterTabs uses Tailwind `capitalize` which breaks "BOL Issues"

- **Severity:** medium
- **Where:** `frontend/src/components/FilterTabs.tsx:38`
- **Repro:** The className includes `capitalize`. Tailwind `capitalize` is `text-transform: capitalize`, which uppercases the first letter of every word and _lowercases_ the rest. So "BOL Issues" becomes "Bol Issues" and "Ready to Build" is fine. "Ready to Build" already matches capitalize output so it's invisible.
- **Speed cost:** zero keystrokes, but makes me look dumb explaining to Jess why the tab says "Bol Issues". Trust-in-app cost.

### 2. In Loads View, clicking a row bounces you to the Wells view instead of expanding

- **Severity:** HIGH (kills the Loads view as a speed workflow)
- **Where:** `frontend/src/pages/DispatchDesk.tsx:979`
- **Repro:** In the new Loads view, `<LoadRow>` is rendered with `onRowClick={() => handleSelectWell(String(load.wellId))}`. Click any row in the cross-well Loads list — it drops you into the well for that load instead of expanding the drawer in place. So I can't expand a row in Loads view, can't copy all fields, can't see photos in the drawer, can't do anything but select the checkbox and click the small Mark Entered button. If my goal in Loads view was "one flat list of everything I need to enter", I lose the drawer, lose keyboard focus, lose my place in the list, and have to rebuild the list from the wells view.
- **Speed cost:** +4–6 clicks per expand in Loads view, plus mental context loss. Makes Loads view worse than Wells view for the actual entry workflow.

### 3. ExpandDrawer has no "Mark Entered" button

- **Severity:** HIGH
- **Where:** `frontend/src/components/ExpandDrawer.tsx:744-834`
- **Repro:** When I open the drawer to copy fields into PCS (Copy All Fields at line 747), I want to mark the load entered right there without collapsing the drawer, scrolling, hunting for my row, and clicking the tiny "Entered" pill. The drawer's action column has: Copy All Fields, Validate (only if not dispatched), Duplicate, Collapse. No Mark Entered. I have to Copy All Fields → paste into PCS → Collapse drawer → find row again → click tiny Entered pill → next load. That's the slowest path in the whole app.
- **Speed cost:** +3 clicks + ~3 seconds per load of "where was I". On 94 loads/day that's ~5 minutes of pure hunting.

### 4. Claim button is missing in Loads view

- **Severity:** medium
- **Where:** `frontend/src/pages/DispatchDesk.tsx:940-981` — the LoadRow in Loads view is rendered without `onClaim`. In the Wells view `:1115-1123` it's wired. Inconsistent.
- **Repro:** In Loads view I can't claim a load. I have to jump to the well first, which defeats the whole flat-list pitch.
- **Speed cost:** Same as #2 — the Loads view punishes you for using it.

### 5. Loads view misuses `deliveredOn` prop to show well name

- **Severity:** low (cosmetic, misleading)
- **Where:** `frontend/src/pages/DispatchDesk.tsx:951` — `deliveredOn={load.wellName ?? null}`
- **Repro:** The Loads view passes well name into the `deliveredOn` prop so the "Well" column repurposes the date formatter. `formatDate` at `LoadRow.tsx:56-66` will try `new Date("Jackson 27-1H")` which will NaN and fall back to the raw string. So it kinda works, but it's wrong typing and will bite someone on the next refactor. Also the "Date" column header in Loads view is `Well` (`:935`) — again, inconsistent with the data model.
- **Speed cost:** zero today, tech debt for tomorrow.

### 6. `handleMarkSingle` indexes PCS numbering by `readyLoads` position — broken with filters

- **Severity:** medium (correctness)
- **Where:** `frontend/src/pages/DispatchDesk.tsx:263-276`
- **Repro:** `const idx = readyLoads.findIndex((l) => l.assignmentId === assignmentId); markEntered.mutate({ ..., pcsStartingNumber: startNum + idx })`. When I mark a load entered from the "BOL Issues" filter or the "Pending" filter (anywhere where the row shows in the filtered list but not in `readyLoads`), `findIndex` returns -1 and I send `startNum - 1` to the backend — bad PCS number assignment. The filter-to-display vs the filter-to-pcs-numbering paths are decoupled.
- **Speed cost:** creates audit pain downstream. I'd rather just pick the PCS number explicitly per load.

### 7. `Advance All` button has no confirmation

- **Severity:** low (safety)
- **Where:** `DispatchDesk.tsx:315-324, 544-553`
- **Repro:** `handleAdvanceAll` fires immediately on click — no `window.confirm`. `handleApproveAll`, `handleMarkAll`, `handleBulkValidate` all have confirmations. Inconsistent. If I fat-finger "Advance All (47)" in the Command Bar, 47 loads move state with no undo.
- **Speed cost:** zero until you blow up your dispatch state. Then a lot.

## Speed Audit — Typical "validated load → entered in PCS → next load" cycle

**Before fixes (Round 1 baseline):**

1. Scroll/eyeball next ready row — 1.5 sec
2. Click row to expand drawer — 1 click, 0.5 sec
3. Click photo if needed — 1 click, 0.5 sec
4. Copy each field by hand into PCS (clipboard icons) — ~8 clicks × 0.4 sec = 3.2 sec
5. Alt-tab to PCS — 0.5 sec
6. Paste — instant
7. Alt-tab back — 0.5 sec
8. Collapse drawer — 1 click, 0.3 sec
9. Find row again, click "Copy" button to mark done — 1–2 clicks, 1 sec

- **~12 clicks, ~8 seconds per load**

**After Round 2 fixes:**

1. Scroll/eyeball next ready row — 1.5 sec (still no keyboard)
2. Click row to expand drawer — 1 click, 0.5 sec
3. Click "Copy All Fields" (new-ish) — 1 click, 0.3 sec
4. Alt-tab to PCS, paste, tab back — 1 sec
5. Collapse drawer — 1 click, 0.3 sec
6. Find row AGAIN, click "Entered" pill (renamed from Copy) — 1 click, 0.8 sec

- **~5 clicks, ~4.5 seconds per load** — roughly 40% faster on the happy path, mostly from "Copy All Fields" bundling the field copies.

**Where the seconds still get lost:**

- Rescanning visually for my place after collapsing the drawer (~1 sec × 94/day = 1.5 min)
- The collapse-then-find-row-then-click-Entered dance (~2 sec × 94/day = 3 min)
- No auto-expand-next, so every transition is a hunt (~1 sec × 94/day = 1.5 min)

**~6 minutes/day of pure friction left on the table** — all of which die with a single J/K keyboard handler that expands-in-place and a "Mark Entered" button inside the drawer.

## Loads View vs Wells View

**Wells view wins for my daily grind.** Here's why:

| Criteria              | Wells view    | Loads view                                                  |
| --------------------- | ------------- | ----------------------------------------------------------- |
| Expand drawer         | yes           | NO — row click bounces you to wells view                    |
| Claim a load          | yes           | NO — prop not wired                                         |
| Date filter required  | no            | yes (gated by `dateFilter`)                                 |
| Drawer copy workflow  | yes           | NO                                                          |
| PCS numbering context | per-well      | lost                                                        |
| When useful           | 90% of my day | "show me everything ahead of Jess's review" — briefing only |

**Verdict:** Loads view is cosmetically impressive but is a dead-end for actual speed building. It's a dashboard, not a workbench. I'd use it once in the morning for a vibes check, then go back to Wells. If you wanted to make it usable, wire onRowClick to expand the drawer in place and thread onClaim through — otherwise pull it back into a "briefing" view separate from the work surface.

## Quick Wins for Round 3 (<30 min each)

1. **Wire `onClick={handleValidateSingle(load.assignmentId)}` on the Missing Ticket button.** `LoadRow.tsx:277-281`. One line. Kills a Round 1 complaint that survived Round 2.
2. **Drop `capitalize` from FilterTabs** (`FilterTabs.tsx:38`). One-word removal, fixes "Bol Issues". Even faster: replace with `normal-case` to keep Tailwind explicit.
3. **Add Mark Entered button to ExpandDrawer action column.** `ExpandDrawer.tsx:744-834`. Pass an `onMarkEntered` prop from DispatchDesk, render a button matching the "Validate" treatment. ~15 minutes. Biggest single speed win I asked for.
4. **Wire onClaim in Loads view.** `DispatchDesk.tsx:940-981`. Copy the existing `onClaim={currentUserId && !load.assignedTo ? ...}` block from the Wells view. 5 minutes.
5. **Add confirmation to `handleAdvanceAll`.** Match the pattern at `handleApproveAll` / `handleMarkAll`. 2 minutes.

## Bigger Asks

1. **Keyboard navigation — J/K or ArrowUp/Down with auto-expand.** The entire point of a speed-builder workbench is that my hands don't leave the keyboard. Every click I have to make is a tax on 94 loads a day. You already have `document.addEventListener("keydown")` at `DispatchDesk.tsx:396` for Shift+A/E/V — extend it:
   - `J` / `ArrowDown` → move focus to next row in current filter, expand drawer, collapse previous
   - `K` / `ArrowUp` → move focus to previous row, same
   - `Enter` → Mark Entered (if validated) or Validate (if pending)
   - `C` → copy all fields (uses existing `handleCopyAll` logic from ExpandDrawer)
   - `F` → flag for Jessica (see below)
   - `?` → show keyboard shortcut sheet
     This is a ~2-hour task and it will give me ~6 minutes/day back. Across 250 working days that's ~25 hours/year — I'd literally pay for this fix.
2. **Persistent "entered today" counter.** Move `enteredIds` to `localStorage` keyed by user+date, or better, compute it server-side from `assignmentStatus === 'dispatched' AND entered_by = current_user AND entered_on = today`. The current React state is lost on every refresh, every navigation, every accidental back-button. Show me "Stephanie: 47 built today across 5 wells" somewhere on the page header.
3. **Flag for Jessica.** `PhotoModal` already has `onFlag` wired as dead code. Add a `flag_reason` column on assignments, wire the PhotoModal onFlag to a `POST /dispatch/assignments/:id/flag` endpoint, and add a "Flagged" filter tab so Jess sees them. This is a ~4-hour full-stack feature but it replaces a dozen texts a day.
4. **Cross-well "my day" counter.** Needs a tiny backend endpoint: `GET /dispatch/entered-today?userId=me`. Paint in the header next to the date filter.
5. **Pull the BOL Queue rename through.** `BolQueue.tsx` still says "JotForm" five places — if the rename is real, finish it.

## Notes for Next Session

- Couldn't hit the live app — Chrome DevTools MCP was unreachable (`172.17.96.1:9222` connect refused). I assume another persona had it locked. All findings here are from code. Please have someone eyeball: (a) the FilterTabs capitalize bug in rendered output, (b) whether the Completion Summary banner actually shows on real data, (c) whether pagination resets properly when switching Wells ↔ Loads view — I see `setPage(1)` in both handlers but didn't live-test.
- Did NOT read: Sidebar.tsx, Login.tsx beyond GhostTitle, Validation.tsx, any backend files. All out of scope for a speed builder.
- Did NOT test: the "Mark All Entered" bulk button end-to-end. If the `pcsStart` field is blank, `parseInt(pcsStart) || 0` sends 0 as the starting number — that's probably not what PCS wants. Worth a test on a fake well.
- Did NOT verify whether backend returns 500s for the `dispatched` status transition from the ready-filter view with an offset-by-one PCS number (issue #6 above). Would need a Jess session or live repro.

---

**Bottom line:** The rename and the photo-zoom and the inline editing are nice cosmetic wins, but my #1 speed complaint (keyboard nav) got zero attention, my #2 speed complaint (Mark Entered in drawer) got zero attention, and the Missing Ticket button that was dead in Round 1 is still dead in Round 2. The new Loads view is a cosmetic dashboard, not a work surface — clicking a row bounces me away from my place. I'm faster than Round 1 by ~40% on the happy path thanks to Copy All Fields, but there's another ~40% waiting behind a single afternoon of keyboard-handler work. Build the keyboard nav, put Mark Entered in the drawer, wire the dead Missing Ticket button, and fix the Loads-view row click. That's my Round 3 wish list.
