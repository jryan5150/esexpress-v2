# Overnight Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close remaining dispatch workflow gaps by morning — demurrage, rawData field stragglers, enhanced well tabs, BOL verification at list level, validation UX consolidation, and sheet-based historical validation.

**Architecture:** All 5 tasks follow the same pattern: extract data from existing rawData JSON in the backend dispatch-desk service, pipe through to frontend props, and render in the UI. No schema changes or migrations needed. The sheet validation endpoint extends the existing sheets plugin.

**Tech Stack:** Fastify + Drizzle (backend), React + TanStack Query (frontend), Google Sheets API (validation import)

**Source materials:** Jess meeting transcript (4/3), gap analysis doc (`docs/2026-04-03-dispatch-workflow-gap-analysis.md`), ScribeHow workflow recordings, dispatch template CSVs.

---

## File Map

| Task | File | Action | Responsibility |
|------|------|--------|---------------|
| 1 | `backend/src/plugins/dispatch/services/dispatch-desk.service.ts` | Modify :220-252 | Add demurrage + time fields to rawData extraction |
| 1 | `frontend/src/components/ExpandDrawer.tsx` | Modify :5-52, :420-582 | Add props + Demurrage section + Timeline times |
| 1 | `frontend/src/pages/DispatchDesk.tsx` | Modify :873-917 | Pass new props through to ExpandDrawer |
| 2 | `frontend/src/components/WellTabBar.tsx` | Modify (full) | Add inline load count + progress bar to each tab |
| 2 | `frontend/src/pages/DispatchDesk.tsx` | Modify :404 | Pass well stats to WellTabBar |
| 3 | `frontend/src/components/LoadRow.tsx` | Modify :5-29, :188-194 | Add bolMatchStatus prop + badge in BOL column |
| 3 | `frontend/src/pages/DispatchDesk.tsx` | Modify :830-850 | Compute + pass bolMatchStatus |
| 3 | `frontend/src/components/FilterTabs.tsx` | Modify :7-14 | Add "bol_mismatch" to filter list |
| 4 | `frontend/src/components/Sidebar.tsx` | Modify :82-97 | Move Validation from main nav into dispatch desk section |
| 4 | `frontend/src/pages/DispatchDesk.tsx` | Modify :620-640 | Add validated count to well picker cards |
| 5 | `backend/src/plugins/sheets/services/sheets.service.ts` | Modify (append) | Add `validateFromSheet()` function |
| 5 | `backend/src/plugins/sheets/routes/sheets.ts` | Modify (append) | Add `POST /sheets/validate-from-sheet` endpoint |
| 5 | `frontend/src/hooks/use-wells.ts` | Modify (append) | Add `useSheetValidation()` mutation hook |

---

### Task 1: Demurrage + Gap 10 Stragglers

**Files:**
- Modify: `backend/src/plugins/dispatch/services/dispatch-desk.service.ts:220-252`
- Modify: `frontend/src/components/ExpandDrawer.tsx:5-52` (props) and `:420-582` (UI sections)
- Modify: `frontend/src/pages/DispatchDesk.tsx:873-917` (prop pass-through)

- [ ] **Step 1: Add rawData extraction in dispatch-desk.service.ts**

In `dispatch-desk.service.ts`, after line 243 (`loadStatus: raw.load_status ?? raw.status ?? null,`), add the new extractions:

```typescript
      // Demurrage (from rawData)
      demurrageAtLoader: raw.demurrage_at_loader ?? null,
      demurrageAtLoaderHours: raw.demurrage_at_loader_hour ?? null,
      demurrageAtLoaderMinutes: raw.demurrage_at_loader_minutes ?? null,
      demurrageAtDestination: raw.demurrage_at_destination ?? null,
      demurrageAtDestHours: raw.demurrage_at_destination_hour ?? null,
      demurrageAtDestMinutes: raw.demurrage_at_destination_minutes ?? null,
      // Timeline gaps (from rawData)
      loadOutTime: raw.terminal_off ?? raw.terminal_off_time ?? null,
      loadTotalTime: raw.terminal_total_time ?? null,
      unloadTotalTime: raw.destination_total_time ?? null,
      appointmentTime: raw.appt_time ?? null,
      // Additional identity
      settlementDate: raw.settlement_date ?? null,
      shipperBol: raw.shipper_bol ?? raw.shipper_bol_no ?? null,
      dispatcherNotes: raw.dispatcher_notes ?? null,
```

- [ ] **Step 2: Add new props to ExpandDrawer interface**

In `ExpandDrawer.tsx`, after line 46 (`loadStatus?: string | null;`), add:

```typescript
  // Demurrage
  demurrageAtLoader?: string | number | null;
  demurrageAtLoaderHours?: string | number | null;
  demurrageAtLoaderMinutes?: string | number | null;
  demurrageAtDestination?: string | number | null;
  demurrageAtDestHours?: string | number | null;
  demurrageAtDestMinutes?: string | number | null;
  // Timeline gaps
  loadOutTime?: string | null;
  loadTotalTime?: string | number | null;
  unloadTotalTime?: string | number | null;
  appointmentTime?: string | null;
  // Additional identity
  settlementDate?: string | null;
  shipperBol?: string | null;
  dispatcherNotes?: string | null;
```

- [ ] **Step 3: Destructure new props in ExpandDrawer component**

In the function destructure (around line 200), add the new props alongside the existing destructured props:

```typescript
  demurrageAtLoader,
  demurrageAtLoaderHours,
  demurrageAtLoaderMinutes,
  demurrageAtDestination,
  demurrageAtDestHours,
  demurrageAtDestMinutes,
  loadOutTime,
  loadTotalTime,
  unloadTotalTime,
  appointmentTime,
  settlementDate,
  shipperBol,
  dispatcherNotes,
```

- [ ] **Step 4: Add Demurrage section in ExpandDrawer UI**

Replace the existing "Demurrage / Load Calculator" section (lines 532-582) with a combined section that shows real demurrage when available, falling back to the calculator:

```tsx
          {/* Demurrage */}
          {(demurrageAtLoader || demurrageAtDestination) && (
            <div className="bg-[#fef3c7] border border-[#f59e0b]/20 rounded-md p-2.5 space-y-1.5">
              <span className="text-[9px] font-semibold text-[#92400e] tracking-[0.08em] uppercase">
                Demurrage
              </span>
              {demurrageAtLoader && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#92400e]/70">At Loader</span>
                  <span className="font-label text-[#92400e] font-bold tabular-nums">
                    ${Number(demurrageAtLoader).toFixed(2)}
                    {demurrageAtLoaderHours || demurrageAtLoaderMinutes
                      ? ` (${demurrageAtLoaderHours ?? 0}h ${demurrageAtLoaderMinutes ?? 0}m)`
                      : ""}
                  </span>
                </div>
              )}
              {demurrageAtDestination && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#92400e]/70">At Destination</span>
                  <span className="font-label text-[#92400e] font-bold tabular-nums">
                    ${Number(demurrageAtDestination).toFixed(2)}
                    {demurrageAtDestHours || demurrageAtDestMinutes
                      ? ` (${demurrageAtDestHours ?? 0}h ${demurrageAtDestMinutes ?? 0}m)`
                      : ""}
                  </span>
                </div>
              )}
              {demurrageAtLoader && demurrageAtDestination && (
                <div className="border-t border-[#f59e0b]/20 pt-1 flex justify-between text-xs">
                  <span className="text-[#92400e] font-bold">Total Demurrage</span>
                  <span className="font-label text-[#92400e] font-bold tabular-nums">
                    ${(Number(demurrageAtLoader) + Number(demurrageAtDestination)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Load Calculator (fallback when no real demurrage) */}
          {rate && weightTons && (
            <div className="bg-primary/5 border border-primary/10 rounded-md p-2.5 space-y-1.5">
              <span className="text-[9px] font-semibold text-primary tracking-[0.08em] uppercase">
                Load Calculator
              </span>
              {/* ... existing calculator code unchanged ... */}
            </div>
          )}
```

- [ ] **Step 5: Add Load/Unload times to Timeline section**

In the Timeline section (around line 426-448), add the missing time entries to the timeline array:

```tsx
              {[
                { label: "Assigned", time: assignedTime, icon: "assignment" },
                { label: "Accepted", time: acceptedTime, icon: "thumb_up" },
                { label: "Pickup", time: pickupTime, icon: "local_shipping" },
                { label: "Load Out", time: loadOutTime, icon: "logout" },
                { label: "Transit", time: transitTime, icon: "route" },
                { label: "ETA", time: appointmentTime, icon: "schedule" },
                { label: "Arrival", time: arrivalTime, icon: "pin_drop" },
              ]
```

And add load/unload time durations below the timeline dots:

```tsx
          {/* Load/Unload Duration */}
          {(loadTotalTime || unloadTotalTime) && (
            <div className="flex gap-3">
              {loadTotalTime && (
                <div className="flex items-center gap-1 text-[10px] text-outline">
                  <span className="material-symbols-outlined text-xs">timer</span>
                  Load: {loadTotalTime}m
                </div>
              )}
              {unloadTotalTime && (
                <div className="flex items-center gap-1 text-[10px] text-outline">
                  <span className="material-symbols-outlined text-xs">timer</span>
                  Unload: {unloadTotalTime}m
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 6: Add settlement date + shipper BOL to References section**

In the References section (around line 594-602), add the new fields to the array:

```tsx
              {[
                { label: "Order #", value: orderNo },
                { label: "Invoice #", value: invoiceNo },
                { label: "PO #", value: poNo },
                { label: "Ref #", value: referenceNo },
                { label: "Shipper BOL", value: shipperBol },
                { label: "Settlement", value: settlementDate },
                { label: "Loader", value: loaderName },
                { label: "Job", value: jobName },
              ]
```

- [ ] **Step 7: Add dispatcher notes display**

After the References section, add a notes section when present:

```tsx
          {dispatcherNotes && (
            <div className="bg-surface-container-high/40 rounded-md p-2.5">
              <span className="text-[9px] font-semibold text-outline tracking-[0.08em] uppercase">
                Dispatcher Notes
              </span>
              <p className="text-xs text-on-surface-variant mt-1 whitespace-pre-wrap">
                {dispatcherNotes}
              </p>
            </div>
          )}
```

- [ ] **Step 8: Pass new props through DispatchDesk.tsx**

In `DispatchDesk.tsx`, in the ExpandDrawer rendering (around line 910-916), add after `loadStatus={load.loadStatus}`:

```tsx
                    demurrageAtLoader={load.demurrageAtLoader}
                    demurrageAtLoaderHours={load.demurrageAtLoaderHours}
                    demurrageAtLoaderMinutes={load.demurrageAtLoaderMinutes}
                    demurrageAtDestination={load.demurrageAtDestination}
                    demurrageAtDestHours={load.demurrageAtDestHours}
                    demurrageAtDestMinutes={load.demurrageAtDestMinutes}
                    loadOutTime={load.loadOutTime}
                    loadTotalTime={load.loadTotalTime}
                    unloadTotalTime={load.unloadTotalTime}
                    appointmentTime={load.appointmentTime}
                    settlementDate={load.settlementDate}
                    shipperBol={load.shipperBol}
                    dispatcherNotes={load.dispatcherNotes}
```

- [ ] **Step 9: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

Start backend + frontend, navigate to dispatch desk, expand a load with PropX data. Verify:
- Demurrage section appears (amber/yellow) when demurrage data exists
- Load Calculator still shows as fallback
- Timeline has Load Out and ETA entries
- Load/Unload duration line appears below timeline
- References section shows Shipper BOL and Settlement Date
- Dispatcher Notes appears when present

- [ ] **Step 10: Commit**

```bash
git add backend/src/plugins/dispatch/services/dispatch-desk.service.ts frontend/src/components/ExpandDrawer.tsx frontend/src/pages/DispatchDesk.tsx
git commit -m "feat: surface demurrage, load/unload times, settlement from rawData

Extracts demurrage_at_loader/destination, terminal_off, load/unload
total times, appointment time, settlement date, shipper BOL, and
dispatcher notes from PropX rawData. Shows real demurrage in amber
section when available, keeps load calculator as fallback.

Closes Gap 10 stragglers from dispatch workflow gap analysis.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Enhanced Well Tabs

**Files:**
- Modify: `frontend/src/components/WellTabBar.tsx` (full rewrite — 53 lines)
- Modify: `frontend/src/pages/DispatchDesk.tsx:404` (pass well stats)

- [ ] **Step 1: Update WellTabBar props to accept well stats**

Replace `WellTabBar.tsx` entirely:

```tsx
import type { Well } from "../types/api";

interface WellStats {
  id: string;
  name: string;
  totalLoads: number;
  dailyTargetLoads: number;
  validated: number;
}

interface WellTabBarProps {
  pinnedWellIds: string[];
  selectedWellId: string;
  wellStats: WellStats[];
  onSelectWell: (id: string) => void;
  onUnpinWell: (id: string) => void;
}

export function WellTabBar({
  pinnedWellIds,
  selectedWellId,
  wellStats,
  onSelectWell,
  onUnpinWell,
}: WellTabBarProps) {
  if (pinnedWellIds.length === 0) return null;

  return (
    <div className="px-7 pt-3 pb-0 flex items-center gap-1 overflow-x-auto shrink-0 border-b border-outline-variant/20">
      {pinnedWellIds.map((wId) => {
        const w = wellStats.find((s) => s.id === wId);
        const isActive = wId === selectedWellId;
        const pct =
          w && w.dailyTargetLoads > 0
            ? Math.round((w.totalLoads / w.dailyTargetLoads) * 100)
            : null;
        return (
          <button
            key={wId}
            onClick={() => onSelectWell(wId)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? "bg-surface-container-lowest text-primary border border-outline-variant/40 border-b-transparent -mb-px"
                : "text-outline hover:text-on-surface hover:bg-surface-container-high/50"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              oil_barrel
            </span>
            <span>{w?.name ?? `Well #${wId}`}</span>
            {w && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`tabular-nums text-[10px] font-bold ${
                    pct !== null && pct >= 100
                      ? "text-tertiary"
                      : pct !== null && pct >= 60
                        ? "text-primary"
                        : "text-outline"
                  }`}
                >
                  {w.totalLoads}
                  {pct !== null ? `/${w.dailyTargetLoads}` : ""}
                </span>
                {pct !== null && (
                  <span className="w-8 h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                    <span
                      className={`block h-full rounded-full transition-all ${
                        pct >= 100
                          ? "bg-tertiary"
                          : pct >= 60
                            ? "bg-primary"
                            : "bg-primary-container"
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </span>
                )}
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onUnpinWell(wId);
              }}
              className="ml-0.5 text-outline/40 hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update DispatchDesk to pass wellStats**

In `DispatchDesk.tsx`, find the `<WellTabBar` usage (around line 404). Replace the `wells` prop with `wellStats`:

Change from:
```tsx
      <WellTabBar
        pinnedWellIds={pinnedWellIds}
        selectedWellId={selectedWellId}
        wells={(wellsQuery.data as Well[]) ?? []}
        onSelectWell={(id) => handleSelectWell(id)}
        onUnpinWell={(id) => setPinnedWellIds((p) => p.filter((x) => x !== id))}
      />
```

To:
```tsx
      <WellTabBar
        pinnedWellIds={pinnedWellIds}
        selectedWellId={selectedWellId}
        wellStats={
          ((wellsQuery.data as any[]) ?? []).map((w: any) => ({
            id: String(w.id ?? ""),
            name: String(w.name ?? ""),
            totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
            dailyTargetLoads: Number(w.dailyTargetLoads ?? w.daily_target_loads ?? 0),
            validated: Number(w.validated ?? 0),
          }))
        }
        onSelectWell={(id) => handleSelectWell(id)}
        onUnpinWell={(id) => setPinnedWellIds((p) => p.filter((x) => x !== id))}
      />
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit`

Open dispatch desk, pin 2-3 wells. Verify:
- Each tab shows well name + load count
- Tabs with targets show `14/30` format + mini progress bar
- Progress bar colors match well picker (green ≥100%, blue ≥60%, gray <60%)
- Close/unpin button still works

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/WellTabBar.tsx frontend/src/pages/DispatchDesk.tsx
git commit -m "feat: enhanced well tabs with at-a-glance load count + progress

Pinned well tabs now show inline load counts (14/30) and a mini
progress bar. Dispatchers see progress across wells without clicking
into each one.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3: BOL Verification at List Level

**Files:**
- Modify: `frontend/src/components/LoadRow.tsx:5-29` (add prop) and `:188-194` (badge in BOL column)
- Modify: `frontend/src/pages/DispatchDesk.tsx:830-850` (compute + pass)
- Modify: `frontend/src/components/FilterTabs.tsx:7-14` (add bol_mismatch filter)

- [ ] **Step 1: Add bolMatchStatus prop to LoadRow**

In `LoadRow.tsx`, add to the `LoadRowProps` interface (after line 21, after `assignedToColor`):

```typescript
  bolMatchStatus?: "match" | "mismatch" | null;
```

Add to the component destructure (after `assignedToColor,`):

```typescript
  bolMatchStatus,
```

- [ ] **Step 2: Add BOL match badge in LoadRow**

In `LoadRow.tsx`, in the BOL / Truck cell (lines 188-194), add a match indicator after the BOL number:

Replace the BOL / Truck column:

```tsx
      {/* BOL / Truck */}
      <div className="flex flex-col gap-0.5">
        <span className="font-label text-[11px] text-on-surface-variant truncate inline-flex items-center gap-1">
          {bolNo || "--"}
          {bolMatchStatus === "match" && (
            <span className="material-symbols-outlined text-[11px] text-tertiary" title="BOL last-4 match">
              verified
            </span>
          )}
          {bolMatchStatus === "mismatch" && (
            <span className="material-symbols-outlined text-[11px] text-error" title="BOL mismatch">
              warning
            </span>
          )}
        </span>
        <span className="text-[11px] text-outline">{truckNo || ""}</span>
      </div>
```

- [ ] **Step 3: Compute bolMatchStatus in DispatchDesk**

In `DispatchDesk.tsx`, in the LoadRow rendering (around line 838), add after `ticketNo={load.ticketNo}`:

```tsx
                  bolMatchStatus={
                    load.jotformBolNo && load.bolNo
                      ? load.bolNo.replace(/\D/g, "").slice(-4) ===
                          load.jotformBolNo.replace(/\D/g, "").slice(-4) &&
                        load.bolNo.replace(/\D/g, "").slice(-4).length >= 4
                        ? "match"
                        : "mismatch"
                      : null
                  }
```

- [ ] **Step 4: Add bol_mismatch to FilterTabs**

In `FilterTabs.tsx`, add `"bol_mismatch"` to the FILTERS array:

```typescript
const FILTERS = [
  "all",
  "pending",
  "assigned",
  "reconciled",
  "ready",
  "validated",
  "bol_mismatch",
] as const;
```

And add a bol_mismatch summary dot to the right-side counters (after the pending counter, around line 55):

```tsx
        <span className="flex items-center gap-[5px] text-[11px] font-medium text-outline">
          <span className="w-2 h-2 rounded-full bg-error shrink-0" />
          {filterCounts.bol_mismatch ?? 0} BOL issues
        </span>
```

- [ ] **Step 5: Compute bol_mismatch filter count in DispatchDesk**

In `DispatchDesk.tsx`, find where `filterCounts` is computed (search for `filterCounts`). Add the bol_mismatch count:

```typescript
    bol_mismatch: allLoads.filter((l) => {
      if (!l.jotformBolNo || !l.bolNo) return false;
      const loadLast4 = l.bolNo.replace(/\D/g, "").slice(-4);
      const jotLast4 = l.jotformBolNo.replace(/\D/g, "").slice(-4);
      return loadLast4.length >= 4 && loadLast4 !== jotLast4;
    }).length,
```

And update `filteredLoads` to handle the `bol_mismatch` filter:

In the filtering logic, add a case for `bol_mismatch`:

```typescript
    if (activeFilter === "bol_mismatch") {
      return allLoads.filter((l) => {
        if (!l.jotformBolNo || !l.bolNo) return false;
        const loadLast4 = l.bolNo.replace(/\D/g, "").slice(-4);
        const jotLast4 = l.jotformBolNo.replace(/\D/g, "").slice(-4);
        return loadLast4.length >= 4 && loadLast4 !== jotLast4;
      });
    }
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc --noEmit`

Open dispatch desk, navigate to a well with JotForm-matched loads. Verify:
- Green verified icon appears next to BOL numbers that match
- Red warning icon appears next to mismatches
- "BOL issues" counter shows in FilterTabs
- Clicking "bol_mismatch" filter shows only mismatched loads

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/LoadRow.tsx frontend/src/pages/DispatchDesk.tsx frontend/src/components/FilterTabs.tsx
git commit -m "feat: BOL verification badges on LoadRow + mismatch filter

Shows green verified/red warning icon next to BOL numbers based on
last-4-digit match with JotForm submission. Adds 'bol_mismatch'
filter tab so Jess can quickly find loads with BOL problems.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Validation UX Consolidation

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx:82-97` (restructure nav)
- Modify: `frontend/src/pages/DispatchDesk.tsx:620-640` (validated count on well cards)

- [ ] **Step 1: Restructure Sidebar nav**

In `Sidebar.tsx`, the Validation link is currently at line 105 under the Admin section. Move it to be grouped with Dispatch Desk as a sub-item. Replace the main nav section (lines 82-96):

```tsx
          <div className="space-y-px">
            <Link to="/" className={navClass("/")}>
              <span className={iconClass("/")}>home</span>
              Today's Objectives
            </Link>
            <Link to="/dispatch-desk" className={navClass("/dispatch-desk")}>
              <span className={iconClass("/dispatch-desk")}>dashboard</span>
              Dispatch Desk
            </Link>
            <Link to="/bol" className={navClass("/bol")}>
              <span className={iconClass("/bol")}>receipt_long</span>
              BOL Queue
            </Link>
            <Link to="/validation" className={navClass("/validation")}>
              <span className={iconClass("/validation")}>rule</span>
              Validation
            </Link>
          </div>
```

And remove the Validation link from the Admin section (lines 105-108). The Admin section becomes just Wells, Companies, Users.

- [ ] **Step 2: Add validated count to well picker cards**

In `DispatchDesk.tsx`, in the well cards section (around line 620-636), the well stats already have `totalLoads`, `ready`, `assigned`. The dispatch-desk backend query already returns `assignmentStatus` for each load. The `filterCounts.validated` is computed from loads with `photoStatus === 'matched'` or similar.

Find the well card rendering (around line 730) where it shows the "Ready" badge. After the Ready badge, add a Validated counter:

```tsx
                            {w.ready > 0 && (
                              <div className="text-right bg-tertiary/5 px-3 py-1.5 rounded-lg">
                                <span className="font-label text-lg font-bold text-tertiary leading-none tabular-nums">
                                  {w.ready}
                                </span>
                                <span className="text-[9px] uppercase font-bold text-tertiary/60 block tracking-wider mt-0.5">
                                  Ready
                                </span>
                              </div>
                            )}
```

Note: The validated count per-well requires knowing how many loads in that well are validated. This data comes from the `wellsQuery` which returns per-well stats. If the wells endpoint doesn't currently return a `validated` count, we need to add it.

Check the wells endpoint response. If it doesn't include validated counts, add to the backend wells query the count of validated loads per well. For now, show the validated count only when inside a well (from filterCounts), not on the picker cards — the per-well validated count requires a backend change.

**Simpler approach for now:** On the well picker cards, add a small "Validated" badge using data from the well-level stats if available:

This step is DEFERRED to a fast follow — the well cards show ready/assigned from backend summary data, and adding validated requires a new backend aggregation query. The validated filter tab in dispatch desk (already exists) handles Jess's primary need.

- [ ] **Step 3: Verify**

Verify in browser:
- Validation appears in main nav (under Dispatch Desk, above BOL Queue)
- Admin section shows only Wells, Companies, Users
- Validated filter tab in dispatch desk works (already existing)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "refactor: move Validation from admin to main nav

Per Jess feedback, validation is a primary workflow not an admin
function. Moves it into the main nav group with Dispatch Desk and
BOL Queue for fewer clicks.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Sheet-Based Historical Validation

**Files:**
- Modify: `backend/src/plugins/sheets/services/sheets.service.ts` (append function)
- Modify: `backend/src/plugins/sheets/routes/sheets.ts` (append endpoint)
- Modify: `frontend/src/hooks/use-wells.ts` (append hook)

- [ ] **Step 1: Add validateFromSheet function to sheets service**

Append to `backend/src/plugins/sheets/services/sheets.service.ts`:

```typescript
// ---------------------------------------------------------------------------
// Sheet-Based Validation — cross-reference Google Sheet against v2 loads
// ---------------------------------------------------------------------------

export interface SheetValidationResult {
  matched: number;
  unmatched: number;
  alreadyValidated: number;
  errors: string[];
  details: Array<{
    row: number;
    loadNo: string;
    wellName: string;
    status: "validated" | "already_validated" | "not_found" | "error";
  }>;
}

/**
 * Cross-reference a Google Sheet against v2 loads to auto-validate matches.
 *
 * For each row in the sheet, looks up loads by loadNo within the specified well.
 * If a matching load is found and not yet validated, marks its assignment as validated
 * by setting photoStatus = 'matched' (which triggers the validated UI state).
 *
 * columnMap must map at minimum: load_no → a column header, well_name → a column header.
 */
export async function validateFromSheet(
  db: Database,
  spreadsheetId: string,
  sheetName: string,
  columnMap: ColumnMap,
  userId: number,
): Promise<SheetValidationResult> {
  const auth = await getGoogleAuth();
  const sheetsApi = google.sheets({ version: "v4", auth });

  const result = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ`,
  });

  const allRows = result.data.values ?? [];
  if (allRows.length < 2) {
    return { matched: 0, unmatched: 0, alreadyValidated: 0, errors: ["Sheet has no data rows"], details: [] };
  }

  const headers = allRows[0] as string[];
  const dataRows = allRows.slice(1);

  // Pre-load all wells for matching
  const allWells = await db
    .select({ id: wells.id, name: wells.name, aliases: wells.aliases })
    .from(wells);

  const stats: SheetValidationResult = {
    matched: 0,
    unmatched: 0,
    alreadyValidated: 0,
    errors: [],
    details: [],
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const mapped: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const dbField = columnMap[header];
      if (dbField && dbField !== "skip") {
        mapped[dbField] = sanitizeCell(row[j] ?? "");
      }
    }

    const loadNo = mapped["load_no"] ?? mapped["loadNo"] ?? "";
    const wellName = mapped["well_name"] ?? mapped["name"] ?? "";

    if (!loadNo) {
      stats.details.push({ row: i + 2, loadNo: "", wellName, status: "error" });
      continue;
    }

    // Resolve well
    const lowerWellName = wellName.toLowerCase().trim();
    const wellMatch = allWells.find(
      (w) =>
        w.name.toLowerCase() === lowerWellName ||
        ((w.aliases as string[]) ?? []).some(
          (a) => a.toLowerCase() === lowerWellName,
        ),
    );

    if (!wellMatch) {
      stats.unmatched++;
      stats.details.push({ row: i + 2, loadNo, wellName, status: "not_found" });
      continue;
    }

    // Find load by loadNo in this well
    const loadRows = await db
      .select({
        assignmentId: assignments.id,
        photoStatus: assignments.photoStatus,
      })
      .from(assignments)
      .innerJoin(loads, eq(assignments.loadId, loads.id))
      .where(
        and(
          eq(loads.loadNo, loadNo),
          eq(assignments.wellId, wellMatch.id),
        ),
      )
      .limit(1);

    if (loadRows.length === 0) {
      stats.unmatched++;
      stats.details.push({ row: i + 2, loadNo, wellName, status: "not_found" });
      continue;
    }

    const assignment = loadRows[0];

    if (assignment.photoStatus === "matched") {
      stats.alreadyValidated++;
      stats.details.push({ row: i + 2, loadNo, wellName, status: "already_validated" });
      continue;
    }

    // Validate: set photoStatus to 'matched'
    await db
      .update(assignments)
      .set({ photoStatus: "matched" as any })
      .where(eq(assignments.id, assignment.assignmentId));

    stats.matched++;
    stats.details.push({ row: i + 2, loadNo, wellName, status: "validated" });
  }

  return stats;
}
```

- [ ] **Step 2: Add route endpoint**

In `backend/src/plugins/sheets/routes/sheets.ts`, add the import for `validateFromSheet` alongside the existing imports. Then append a new route before the closing `};`:

```typescript
  // ─── POST /validate-from-sheet — cross-reference sheet for bulk validation ─
  fastify.post(
    "/validate-from-sheet",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["spreadsheetId", "sheetName", "columnMap"],
          properties: {
            spreadsheetId: { type: "string", minLength: 1 },
            sheetName: { type: "string", minLength: 1 },
            columnMap: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "Database not connected" },
        });
      }

      const { spreadsheetId, sheetName, columnMap } = request.body as {
        spreadsheetId: string;
        sheetName: string;
        columnMap: ColumnMap;
      };
      const user = request.user as { id: number };

      const result = await validateFromSheet(db, spreadsheetId, sheetName, columnMap, user.id);
      return {
        success: true,
        data: result,
        meta: {
          summary: `${result.matched} validated, ${result.alreadyValidated} already done, ${result.unmatched} not found`,
        },
      };
    },
  );
```

- [ ] **Step 3: Add frontend mutation hook**

Append to `frontend/src/hooks/use-wells.ts`:

```typescript
export function useSheetValidation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      spreadsheetId: string;
      sheetName: string;
      columnMap: Record<string, string>;
    }) => api.post("/sheets/validate-from-sheet", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.dispatchDesk._def });
      queryClient.invalidateQueries({ queryKey: qk.wells._def });
    },
  });
}
```

- [ ] **Step 4: Verify endpoint**

Test with curl (replace token and IDs):

```bash
curl -X POST http://localhost:3000/api/v1/sheets/validate-from-sheet \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "YOUR_SHEET_ID",
    "sheetName": "Dispatch Sheet",
    "columnMap": {
      "Load #": "load_no",
      "Well": "well_name"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "matched": 142,
    "unmatched": 8,
    "alreadyValidated": 23,
    "errors": [],
    "details": [...]
  },
  "meta": { "summary": "142 validated, 23 already done, 8 not found" }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/plugins/sheets/services/sheets.service.ts backend/src/plugins/sheets/routes/sheets.ts frontend/src/hooks/use-wells.ts
git commit -m "feat: sheet-based historical validation endpoint

POST /sheets/validate-from-sheet cross-references a Google Sheet
against v2 loads by loadNo + well name. Matching loads are auto-
validated. Returns summary counts and per-row details.

Enables bulk validation of historical loads using dispatchers'
existing Google Sheets as the source of truth.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Execution Order

Tasks 1-4 are independent and can be parallelized. Task 5 is also independent but should be done last since it's backend-only and lower priority for the morning visual.

**Recommended order for solo execution:** 1 → 3 → 2 → 4 → 5

This front-loads the most visible changes (demurrage data, BOL badges) and lets the simpler UI tweaks (tabs, nav) happen after.

## Verification Checklist

After all tasks complete:

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] Backend starts without errors
- [ ] Dispatch desk → expand load → see demurrage section (amber) when data exists
- [ ] Dispatch desk → expand load → see Load Out + ETA in timeline
- [ ] Dispatch desk → expand load → see Shipper BOL, Settlement Date in references
- [ ] Pinned well tabs show load counts + progress bars
- [ ] LoadRow shows green check / red warning next to BOL numbers
- [ ] "BOL issues" filter tab works
- [ ] Validation link in main nav (not buried in admin)
- [ ] Sheet validation endpoint returns correct match counts
