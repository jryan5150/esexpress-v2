# Unified Worksurface — Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified `/workbench` daily-work surface that mirrors the Load Count Sheet's mental model (Builder Matrix top + Well Grid main + 3 expand-down sections), absorbs the Validation page, and uses cell colors COMPUTED from v2's load lifecycle (no stored paint).

**Architecture:** Two new backend `GET` endpoints (`/diag/well-grid`, `/diag/inbox`); seven new/modified frontend files; zero schema changes (all derivable from existing tables). Reuses existing `WorkbenchDrawer`, `WorkbenchRow`, `ManualMatchPanel`, builder-matrix endpoint, sheet-status endpoint, jenny-queue endpoint.

**Tech Stack:** Fastify + Drizzle ORM (postgres.js) + Vite + React 19 + Tailwind v4 + react-router-dom + @tanstack/react-query. Existing deploy: `git push lexcom main` (Railway backend) + `vercel deploy --prod --yes` (Vercel frontend).

**Spec:** `docs/superpowers/specs/2026-04-26-unified-worksurface-design.md`

---

## File Structure

### New backend files

None — both new endpoints append to existing `backend/src/plugins/diagnostics/routes/diag.ts`.

### New frontend files

| Path                                              | Purpose                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `frontend/src/components/WellGrid.tsx`            | The main Bill To × Well × Day grid component. Pure render given data.     |
| `frontend/src/components/WellGridCell.tsx`        | Single cell — dual-color stripe + count + mismatch badge + click handler. |
| `frontend/src/components/UserHighlightStrip.tsx`  | Filter pill row above the grid (Mine / All / Liberty / Logistix / JRT).   |
| `frontend/src/components/InboxSection.tsx`        | Collapsing section: builder→customer-filtered "needs you" items.          |
| `frontend/src/components/TodayIntakeSection.tsx`  | Collapsing section: last-4hr BOL/JotForm landings + manual match.         |
| `frontend/src/components/JennyQueueSection.tsx`   | Collapsing section: non-standard work by category.                        |
| `frontend/src/components/WorksurfaceTopStrip.tsx` | Compact top strip rendering the Builder Matrix.                           |

### Modified frontend files

| Path                                          | Change                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `frontend/src/pages/Workbench.tsx`            | Full rewrite: shell that mounts the 5 components above + extends WorkbenchDrawer. |
| `frontend/src/components/WorkbenchDrawer.tsx` | Add cell-summary header (when opened from a cell) + context-aware action bar.     |
| `frontend/src/app.tsx`                        | Replace `/validation` route with `<Navigate to="/workbench" replace />`.          |
| `frontend/src/components/Sidebar.tsx`         | Remove "Validate" entry; keep "Workbench" label.                                  |

### Untouched (Wave 1)

`frontend/src/pages/BolQueue.tsx`, `frontend/src/pages/LoadReport.tsx`, `frontend/src/pages/ExceptionFeed.tsx`, `frontend/src/pages/Validation.tsx` (deleted at end of Task 7 only after redirect verified).

---

## Branch & deploy strategy

- Work on `main` (this project ships frequently from main). Frequent commits; deploy after each Task verifies end-to-end.
- Backend: `git push lexcom main` triggers Railway auto-build.
- Frontend: `vercel deploy --prod --yes` from repo root (NOT from `frontend/`).
- Verification poll: `curl -sf https://backend-production-7960.up.railway.app/api/v1/diag/<endpoint>`.

---

## Task 1 — Backend: `GET /diag/well-grid` endpoint

**Estimate:** 2hr · **Dependencies:** none · **File:** `backend/src/plugins/diagnostics/routes/diag.ts`

Per-cell aggregate: count + lifecycle-derived workflow status for every (well, day) in a Sun-Sat week. Mirrors the structure of `/admin/builder-matrix` but at the per-well-per-day grain.

**Files:**

- Modify: `backend/src/plugins/diagnostics/routes/diag.ts` (insert before line 1166 where `/builder-matrix` lives, so `/well-grid` reads naturally as a sibling)

- [ ] **Step 1.1: Add the endpoint with happy-path SQL**

Insert this block in `diag.ts` right before the `/builder-matrix` registration (around line 1166):

```typescript
// GET /well-grid — per-cell v2 aggregate + lifecycle-derived color
// for the Sun-Sat week starting weekStart. Output mirrors the Load
// Count Sheet's grid: Bill To × Wells (rows) × Sun-Sat (cols).
// Color is COMPUTED every request from underlying load lifecycle
// (assignments.status, photo_status, pcs_dispatch.cleared_at,
// pcs_invoice.status, well.needs_rate_info, well.rate_per_ton).
// See docs/superpowers/specs/2026-04-26-unified-worksurface-design.md
// §"Lifecycle → Computed Color Rule" for the rule definition.
fastify.get("/well-grid", async (request, reply) => {
  const db = fastify.db;
  if (!db)
    return reply.status(503).send({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
    });
  const { sql } = await import("drizzle-orm");

  const q = (request.query ?? {}) as { weekStart?: string };
  let weekStart = q.weekStart;
  if (!weekStart) {
    const r = (await db.execute(sql`
        SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day') - interval '1 day')::date AS sunday
      `)) as unknown as Array<{ sunday: string | Date }>;
    weekStart = String(r[0]?.sunday ?? "").slice(0, 10);
  }

  // Per (well, day) aggregate. delivered_on is timestamptz; cast to
  // America/Chicago date and compare to (weekStart + dow days).
  const cellsRow = (await db.execute(sql`
      WITH this_week AS (
        SELECT
          a.well_id,
          ((l.delivered_on AT TIME ZONE 'America/Chicago')::date - ${weekStart}::date) AS dow,
          COUNT(*)::int AS load_count,
          BOOL_OR(a.photo_status = 'missing') AS any_missing_photo,
          BOOL_OR(l.driver_name IS NULL OR TRIM(l.driver_name) = '') AS any_missing_driver,
          BOOL_OR(a.status = 'pending') AS any_pending,
          BOOL_OR(a.status = 'built') AS any_built,
          BOOL_OR(a.status IN ('dispatched','built')) AS any_dispatched_or_built
        FROM loads l
        JOIN assignments a ON a.load_id = l.id
        WHERE l.delivered_on >= (${weekStart}::date AT TIME ZONE 'America/Chicago')
          AND l.delivered_on < ((${weekStart}::date + interval '7 days') AT TIME ZONE 'America/Chicago')
          AND a.well_id IS NOT NULL
        GROUP BY a.well_id, dow
      )
      SELECT
        tw.well_id,
        w.name AS well_name,
        c.id AS customer_id,
        c.name AS bill_to,
        tw.dow,
        tw.load_count,
        tw.any_missing_photo,
        tw.any_missing_driver,
        tw.any_pending,
        tw.any_built,
        w.needs_rate_info,
        w.rate_per_ton
      FROM this_week tw
      JOIN wells w ON w.id = tw.well_id
      LEFT JOIN loads l2 ON l2.id = (
        SELECT load_id FROM assignments WHERE well_id = tw.well_id LIMIT 1
      )
      LEFT JOIN customers c ON c.id = l2.customer_id
      WHERE tw.dow BETWEEN 0 AND 6
      ORDER BY c.name NULLS LAST, w.name, tw.dow
    `)) as unknown as Array<{
    well_id: number;
    well_name: string;
    customer_id: number | null;
    bill_to: string | null;
    dow: number;
    load_count: number;
    any_missing_photo: boolean;
    any_missing_driver: boolean;
    any_pending: boolean;
    any_built: boolean;
    needs_rate_info: boolean;
    rate_per_ton: string | null;
  }>;

  // Lifecycle → status. "Laggard wins" — earliest unresolved stage.
  function deriveStatus(row: (typeof cellsRow)[number]): string {
    if (row.needs_rate_info || row.rate_per_ton == null)
      return "need_rate_info";
    if (row.any_missing_photo) return "missing_tickets";
    if (row.any_missing_driver) return "missing_driver";
    if (row.any_pending) return "loads_being_built";
    if (row.any_built) return "loads_completed";
    // Phase 2.5: pcs_dispatch + pcs_invoice joins
    return "loads_completed";
  }

  interface Cell {
    wellId: number;
    wellName: string;
    customerId: number | null;
    billTo: string | null;
    dow: number;
    loadCount: number;
    derivedStatus: string;
  }
  const cells: Cell[] = cellsRow.map((r) => ({
    wellId: r.well_id,
    wellName: r.well_name,
    customerId: r.customer_id,
    billTo: r.bill_to,
    dow: r.dow,
    loadCount: r.load_count,
    derivedStatus: deriveStatus(r),
  }));

  // Group cells into rows keyed by (well_id) so the frontend can
  // render Bill To × Well × Sun-Sat with one fetch.
  const byWell = new Map<
    number,
    {
      wellId: number;
      wellName: string;
      customerId: number | null;
      billTo: string | null;
      days: Array<Cell | null>;
    }
  >();
  for (const c of cells) {
    let row = byWell.get(c.wellId);
    if (!row) {
      row = {
        wellId: c.wellId,
        wellName: c.wellName,
        customerId: c.customerId,
        billTo: c.billTo,
        days: Array(7).fill(null),
      };
      byWell.set(c.wellId, row);
    }
    if (c.dow >= 0 && c.dow < 7) row.days[c.dow] = c;
  }
  const rows = Array.from(byWell.values()).sort((a, b) => {
    const aBT = a.billTo ?? "";
    const bBT = b.billTo ?? "";
    if (aBT !== bBT) return aBT.localeCompare(bBT);
    return a.wellName.localeCompare(b.wellName);
  });

  // Week endpoints for UI date display
  const weekEndDate = new Date(
    new Date(weekStart + "T00:00:00Z").getTime() + 6 * 24 * 60 * 60 * 1000,
  );
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  return {
    success: true,
    data: {
      weekStart,
      weekEnd,
      tz: "America/Chicago",
      rows,
      rowCount: rows.length,
      totalCells: cells.length,
    },
  };
});
```

- [ ] **Step 1.2: Type-check passes**

```bash
cd /home/jryan/projects/work/esexpress-v2/backend && npx tsc --noEmit 2>&1 | grep -i "diag.ts" | head -5
```

Expected: no output (clean).

- [ ] **Step 1.3: Commit + push backend**

```bash
cd /home/jryan/projects/work/esexpress-v2
git add backend/src/plugins/diagnostics/routes/diag.ts
git commit -m "feat(diag): /diag/well-grid endpoint — per-cell v2 aggregate + derived status

For Wave 1 of the unified worksurface. Computes per (well, day) load count
plus lifecycle-derived workflow status. Status rule: laggard-wins from
photo/driver/assignment/well-rate state. PCS dispatch/invoice joins
deferred to Phase 2.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
```

- [ ] **Step 1.4: Smoke endpoint after Railway deploy**

```bash
until curl -sf "https://backend-production-7960.up.railway.app/api/v1/diag/well-grid" -o /tmp/grid.json 2>/dev/null && python3 -c "import json; d=json.load(open('/tmp/grid.json'))['data']; assert 'rows' in d" 2>/dev/null; do sleep 8; done
echo "OK"
python3 -c "
import json
d = json.load(open('/tmp/grid.json'))['data']
print(f\"week={d['weekStart']} to {d['weekEnd']}  rows={d['rowCount']}  cells={d['totalCells']}\")
for r in d['rows'][:5]:
    nonempty = sum(1 for x in r['days'] if x)
    print(f\"  {r['billTo'] or '(no bill_to)'} / {r['wellName']}  active_days={nonempty}\")
"
```

Expected: ≥5 rows printed with non-empty days. If `rowCount=0`, the SQL is correct but no loads delivered this week — check by running last week instead: `?weekStart=2026-04-19`.

---

## Task 2 — Backend: `GET /diag/inbox` endpoint

**Estimate:** 1.5hr · **Dependencies:** none · **File:** `backend/src/plugins/diagnostics/routes/diag.ts`

Pulls "needs you" items per builder's customer set. Returns urgency-sorted list (workflow-first per spec sub-question B): Missing photos → Uncertain matches → PCS discrepancies → Sheet drift.

**Files:**

- Modify: `backend/src/plugins/diagnostics/routes/diag.ts` (insert immediately after `/well-grid`)

- [ ] **Step 2.1: Add the endpoint**

Insert in `diag.ts` immediately after the `/well-grid` block:

```typescript
// GET /inbox — "needs you" items filtered by builder→customer mapping.
// Workflow-first urgency order (per spec sub-question B):
//   1. missing_photos     — delivered loads with no BOL photo, age >4hr
//   2. uncertain_matches  — assignment.status='pending' with no recent decision
//   3. pcs_discrepancies  — discrepancies on this customer's loads
//   4. sheet_drift        — sheet_status_drift discrepancies on this customer's wells
//
// Query: ?customerIds=1,2,3 (numeric, comma-separated). Empty/no
// param = no filter (manager view = sees everything).
fastify.get("/inbox", async (request, reply) => {
  const db = fastify.db;
  if (!db)
    return reply.status(503).send({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
    });
  const { sql } = await import("drizzle-orm");

  const q = (request.query ?? {}) as { customerIds?: string };
  const customerIds = (q.customerIds ?? "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  const customerFilter =
    customerIds.length > 0
      ? sql`AND l.customer_id IN (${sql.join(
          customerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;

  // Missing photos: delivered >4hr ago, no attached photo
  const missingPhotos = (await db.execute(sql`
      SELECT
        'missing_photo' AS kind,
        l.id AS load_id, a.id AS assignment_id, a.well_id,
        w.name AS well_name, c.name AS bill_to,
        l.delivered_on::date AS day,
        l.driver_name, l.bol_no, l.ticket_no
      FROM loads l
      JOIN assignments a ON a.load_id = l.id
      LEFT JOIN wells w ON w.id = a.well_id
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE a.photo_status = 'missing'
        AND l.delivered_on < now() - interval '4 hours'
        AND l.delivered_on > now() - interval '14 days'
        ${customerFilter}
      ORDER BY l.delivered_on DESC
      LIMIT 50
    `)) as unknown as Array<Record<string, unknown>>;

  // Uncertain matches: pending assignments with no recent decision
  const uncertainMatches = (await db.execute(sql`
      SELECT
        'uncertain_match' AS kind,
        l.id AS load_id, a.id AS assignment_id, a.well_id,
        w.name AS well_name, c.name AS bill_to,
        l.delivered_on::date AS day,
        l.driver_name, l.bol_no, l.ticket_no
      FROM assignments a
      JOIN loads l ON l.id = a.load_id
      LEFT JOIN wells w ON w.id = a.well_id
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE a.status = 'pending'
        AND l.delivered_on > now() - interval '14 days'
        ${customerFilter}
      ORDER BY l.delivered_on DESC
      LIMIT 50
    `)) as unknown as Array<Record<string, unknown>>;

  // PCS discrepancies on this customer's loads
  const pcsDiscrepancies = (await db.execute(sql`
      SELECT
        'pcs_discrepancy' AS kind,
        d.id AS discrepancy_id, d.discrepancy_type, d.severity, d.message,
        l.id AS load_id, a.id AS assignment_id, a.well_id,
        w.name AS well_name, c.name AS bill_to,
        l.delivered_on::date AS day
      FROM discrepancies d
      LEFT JOIN assignments a ON a.id = d.assignment_id
      LEFT JOIN loads l ON l.id = COALESCE(d.load_id, a.load_id)
      LEFT JOIN wells w ON w.id = a.well_id
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE d.resolved_at IS NULL
        AND d.discrepancy_type IN ('status_drift','weight_drift','well_mismatch','rate_drift','photo_gap')
        ${customerFilter}
      ORDER BY d.severity DESC, d.detected_at DESC
      LIMIT 50
    `)) as unknown as Array<Record<string, unknown>>;

  // Sheet-drift discrepancies (sheet_status_drift type)
  const sheetDrift = (await db.execute(sql`
      SELECT
        'sheet_drift' AS kind,
        d.id AS discrepancy_id, d.message, d.severity,
        l.id AS load_id, a.id AS assignment_id, a.well_id,
        w.name AS well_name, c.name AS bill_to,
        l.delivered_on::date AS day
      FROM discrepancies d
      LEFT JOIN assignments a ON a.id = d.assignment_id
      LEFT JOIN loads l ON l.id = COALESCE(d.load_id, a.load_id)
      LEFT JOIN wells w ON w.id = a.well_id
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE d.resolved_at IS NULL
        AND d.discrepancy_type IN ('sheet_status_drift','sheet_cell_count_drift','sheet_vs_v2_well_count')
        ${customerFilter}
      ORDER BY d.detected_at DESC
      LIMIT 50
    `)) as unknown as Array<Record<string, unknown>>;

  return {
    success: true,
    data: {
      customerIds,
      urgencyOrder: [
        "missing_photo",
        "uncertain_match",
        "pcs_discrepancy",
        "sheet_drift",
      ],
      items: {
        missing_photos: missingPhotos,
        uncertain_matches: uncertainMatches,
        pcs_discrepancies: pcsDiscrepancies,
        sheet_drift: sheetDrift,
      },
      counts: {
        missing_photos: missingPhotos.length,
        uncertain_matches: uncertainMatches.length,
        pcs_discrepancies: pcsDiscrepancies.length,
        sheet_drift: sheetDrift.length,
        total:
          missingPhotos.length +
          uncertainMatches.length +
          pcsDiscrepancies.length +
          sheetDrift.length,
      },
    },
  };
});
```

- [ ] **Step 2.2: Type-check**

```bash
cd /home/jryan/projects/work/esexpress-v2/backend && npx tsc --noEmit 2>&1 | grep -i "diag.ts" | head -5
```

Expected: no output.

- [ ] **Step 2.3: Commit + push**

```bash
cd /home/jryan/projects/work/esexpress-v2
git add backend/src/plugins/diagnostics/routes/diag.ts
git commit -m "feat(diag): /diag/inbox endpoint — workflow-first needs-you items

Per spec sub-question B: workflow-first urgency order (missing photos →
uncertain matches → PCS discrepancies → sheet drift). Filters by
customerIds query param to scope to a builder's customer; empty filter =
manager view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
```

- [ ] **Step 2.4: Smoke after Railway deploy**

```bash
until curl -sf "https://backend-production-7960.up.railway.app/api/v1/diag/inbox" -o /tmp/inbox.json 2>/dev/null && python3 -c "import json; d=json.load(open('/tmp/inbox.json'))['data']; assert 'counts' in d" 2>/dev/null; do sleep 8; done
echo "OK"
python3 -c "
import json
d = json.load(open('/tmp/inbox.json'))['data']
print('Inbox counts (manager view, no filter):')
for k, v in d['counts'].items():
    print(f'  {k}: {v}')
"

# Filtered for Liberty (customer_id=1)
curl -s "https://backend-production-7960.up.railway.app/api/v1/diag/inbox?customerIds=1" -o /tmp/inbox-liberty.json
python3 -c "
import json
d = json.load(open('/tmp/inbox-liberty.json'))['data']
print('Inbox counts for Liberty only:')
for k, v in d['counts'].items():
    print(f'  {k}: {v}')
"
```

Expected: at least 1 item in `total` for the manager view (Saturday's data shows 28 sheet-drift cells, 1+ uncertain).

---

## Task 3 — Frontend: rewrite `Workbench.tsx` shell

**Estimate:** 3hr · **Dependencies:** Task 1 · **File:** `frontend/src/pages/Workbench.tsx`

The shell mounts: top strip + highlight pill row + well grid + 3 expand-down sections + drawer. Reads URL state for week/highlight/cell. The 5 mountable components are stubs in this task; later tasks fill them.

**Files:**

- Create: `frontend/src/components/WorksurfaceTopStrip.tsx`
- Create: `frontend/src/components/UserHighlightStrip.tsx`
- Create: `frontend/src/components/WellGrid.tsx`
- Create: `frontend/src/components/WellGridCell.tsx`
- Create: `frontend/src/components/InboxSection.tsx` (stub)
- Create: `frontend/src/components/TodayIntakeSection.tsx` (stub)
- Create: `frontend/src/components/JennyQueueSection.tsx` (stub)
- Modify: `frontend/src/pages/Workbench.tsx` (full rewrite)

- [ ] **Step 3.1: Create stub `InboxSection.tsx`** (filled in Task 5)

```typescript
// frontend/src/components/InboxSection.tsx
import { useState } from "react";

export function InboxSection({ customerIds }: { customerIds: number[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="text-sm font-semibold uppercase tracking-wide">
          Your Inbox
        </span>
        <span className="text-xs text-text-secondary">
          {open ? "Collapse ↑" : "Expand ↓"}
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-border text-sm text-text-secondary">
          Stub — filled in Task 5. Filtering customers: {customerIds.join(", ") || "all (manager view)"}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3.2: Create stub `TodayIntakeSection.tsx`** (filled in Task 6)

```typescript
// frontend/src/components/TodayIntakeSection.tsx
import { useState } from "react";

export function TodayIntakeSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="text-sm font-semibold uppercase tracking-wide">
          Today's Intake
        </span>
        <span className="text-xs text-text-secondary">
          {open ? "Collapse ↑" : "Expand ↓"}
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-border text-sm text-text-secondary">
          Stub — filled in Task 6.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3.3: Create stub `JennyQueueSection.tsx`** (filled in Task 7)

```typescript
// frontend/src/components/JennyQueueSection.tsx
import { useState } from "react";

export function JennyQueueSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="text-sm font-semibold uppercase tracking-wide">
          Jenny's Queue
        </span>
        <span className="text-xs text-text-secondary">
          {open ? "Collapse ↑" : "Expand ↓"}
        </span>
      </button>
      {open && (
        <div className="p-4 border-t border-border text-sm text-text-secondary">
          Stub — filled in Task 7.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3.4: Create `WorksurfaceTopStrip.tsx`**

```typescript
// frontend/src/components/WorksurfaceTopStrip.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface MatrixRow {
  builder: string;
  customer: string | null;
  customerId: number | null;
  isPrimary: boolean;
  notes: string | null;
  counts: { sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number };
  total: number;
}

interface MatrixPayload {
  weekStart: string;
  weekEnd: string;
  matrix: MatrixRow[];
  grandTotal: number;
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  weekStart?: string;
  onBuilderClick?: (customerId: number | null) => void;
}

export function WorksurfaceTopStrip({ weekStart, onBuilderClick }: Props) {
  const matrixQuery = useQuery({
    queryKey: ["worksurface", "top-strip", weekStart],
    queryFn: () =>
      api
        .get<{ success: boolean; data: MatrixPayload }>(
          weekStart
            ? `/diag/builder-matrix?weekStart=${weekStart}`
            : `/diag/builder-matrix`,
        )
        .then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = matrixQuery.data;
  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-3 text-xs text-text-secondary">
        Loading top strip...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-text-secondary border-b border-border">
            <th className="py-2 pl-3 pr-2">Bill To</th>
            <th className="py-2 pr-2">Builder</th>
            {DOW_LABELS.map((d) => (
              <th key={d} className="py-2 pr-2 text-right tabular-nums w-12">
                {d}
              </th>
            ))}
            <th className="py-2 pr-3 text-right tabular-nums font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.matrix.map((r) => (
            <tr
              key={`${r.builder}-${r.customerId ?? "none"}`}
              className={`border-b border-border/40 cursor-pointer hover:bg-bg-tertiary ${
                r.isPrimary ? "" : "opacity-70"
              }`}
              onClick={() => onBuilderClick?.(r.customerId)}
            >
              <td className="py-1.5 pl-3 pr-2">
                {r.customer ?? <span className="italic text-text-secondary">(floater)</span>}
              </td>
              <td className="py-1.5 pr-2 font-medium">
                {r.builder}
                {!r.isPrimary && (
                  <span className="ml-1 text-[10px] px-1 rounded bg-bg-primary text-text-secondary border border-border">
                    backup
                  </span>
                )}
              </td>
              {DOW.map((dk) => (
                <td key={dk} className="py-1.5 pr-2 text-right tabular-nums text-text-secondary">
                  {r.counts[dk] || ""}
                </td>
              ))}
              <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">
                {r.total.toLocaleString()}
              </td>
            </tr>
          ))}
          <tr className="bg-bg-primary/40">
            <td colSpan={2} className="py-2 pl-3 pr-2 font-semibold uppercase tracking-wide">
              Grand
            </td>
            {DOW.map((dk) => {
              const total = data.matrix.reduce((a, r) => a + (r.counts[dk] || 0), 0);
              return (
                <td key={dk} className="py-2 pr-2 text-right tabular-nums font-medium">
                  {total || ""}
                </td>
              );
            })}
            <td className="py-2 pr-3 text-right tabular-nums font-bold text-base">
              {data.grandTotal.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3.5: Create `UserHighlightStrip.tsx`**

```typescript
// frontend/src/components/UserHighlightStrip.tsx
interface Props {
  customers: Array<{ id: number; name: string }>;
  highlight: number | "all" | "mine_only";
  onHighlight: (next: number | "all" | "mine_only") => void;
  myCustomerId: number | null;
}

export function UserHighlightStrip({ customers, highlight, onHighlight, myCustomerId }: Props) {
  const pillClass = (active: boolean) =>
    `px-3 py-1 text-xs rounded-full border transition-colors ${
      active
        ? "bg-accent text-white border-accent"
        : "bg-bg-primary border-border text-text-secondary hover:bg-bg-tertiary"
    }`;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {myCustomerId != null && (
        <button
          type="button"
          onClick={() => onHighlight("mine_only")}
          className={pillClass(highlight === "mine_only")}
        >
          Mine Only
        </button>
      )}
      <button
        type="button"
        onClick={() => onHighlight("all")}
        className={pillClass(highlight === "all")}
      >
        All
      </button>
      {customers.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onHighlight(c.id)}
          className={pillClass(highlight === c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3.6: Create `WellGridCell.tsx`** — single cell render

```typescript
// frontend/src/components/WellGridCell.tsx
const STATUS_HEX: Record<string, string> = {
  loads_being_built: "#00ff00",
  loads_completed: "#ff00ff",
  loads_being_cleared: "#f46fa2",
  loads_cleared: "#da3876",
  export_transfers_completed: "#ffff00",
  invoiced: "#4a86e8",
  missing_tickets: "#9900ff",
  missing_driver: "#00ffff",
  need_rate_info: "#e69138",
  unknown: "#cccccc",
};

const STATUS_ORDER: Record<string, number> = {
  missing_tickets: 0,
  missing_driver: 1,
  loads_being_built: 2,
  loads_completed: 3,
  loads_being_cleared: 4,
  loads_cleared: 5,
  export_transfers_completed: 5, // side branch — same as cleared for distance
  invoiced: 6,
  need_rate_info: -1, // exception, never adjacent
  unknown: -2,
};

function stageDistance(a: string, b: string): number {
  const ai = STATUS_ORDER[a] ?? -2;
  const bi = STATUS_ORDER[b] ?? -2;
  if (ai < 0 || bi < 0) return 99;
  return Math.abs(ai - bi);
}

interface Props {
  loadCount: number;
  derivedStatus: string;
  paintedStatus?: string | null; // sheet's painted color status (if available)
  onClick: () => void;
  onBadgeClick?: () => void;
}

export function WellGridCell({
  loadCount,
  derivedStatus,
  paintedStatus,
  onClick,
  onBadgeClick,
}: Props) {
  const derivedHex = STATUS_HEX[derivedStatus] ?? STATUS_HEX.unknown;
  const paintedHex = paintedStatus ? STATUS_HEX[paintedStatus] ?? null : null;
  const showBadge =
    paintedStatus && stageDistance(derivedStatus, paintedStatus) > 1;

  if (loadCount === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-10 h-7 rounded border border-border/40 bg-bg-primary/40 text-[10px] text-text-secondary hover:border-border"
        aria-label="Empty cell"
      >
        ·
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-10 h-7 rounded border border-border overflow-hidden flex items-center justify-center text-[11px] font-semibold text-black/80 hover:ring-2 hover:ring-accent"
      aria-label={`Cell with ${loadCount} loads, status ${derivedStatus}`}
      title={`${loadCount} loads · v2: ${derivedStatus}${paintedStatus ? ` · sheet: ${paintedStatus}` : ""}`}
    >
      {/* Top half: sheet-painted color (if available) */}
      {paintedHex && (
        <div
          className="absolute inset-x-0 top-0 h-1/2"
          style={{ backgroundColor: paintedHex }}
        />
      )}
      {/* Bottom half: v2-derived color */}
      <div
        className={`absolute inset-x-0 ${paintedHex ? "bottom-0 h-1/2" : "inset-y-0"}`}
        style={{ backgroundColor: derivedHex }}
      />
      <span className="relative z-10">{loadCount}</span>
      {showBadge && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onBadgeClick?.();
          }}
          className="absolute -top-1 -right-1 z-20 w-3 h-3 rounded-full bg-amber-500 border border-white text-[8px] font-bold text-white flex items-center justify-center"
          title={`Mismatch: sheet says ${paintedStatus}, v2 says ${derivedStatus}`}
        >
          !
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3.7: Create `WellGrid.tsx`** — full grid using cells above

```typescript
// frontend/src/components/WellGrid.tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { WellGridCell } from "./WellGridCell";

interface GridCell {
  wellId: number;
  wellName: string;
  customerId: number | null;
  billTo: string | null;
  dow: number;
  loadCount: number;
  derivedStatus: string;
}
interface GridRow {
  wellId: number;
  wellName: string;
  customerId: number | null;
  billTo: string | null;
  days: Array<GridCell | null>;
}
interface GridPayload {
  weekStart: string;
  weekEnd: string;
  rows: GridRow[];
  rowCount: number;
  totalCells: number;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  weekStart?: string;
  highlight: number | "all" | "mine_only";
  myCustomerId: number | null;
  onCellClick: (wellId: number, dow: number) => void;
  onBadgeClick: (wellId: number, dow: number) => void;
  paintedStatusByCell?: Map<string, string>; // key: `${wellId}-${dow}`
}

export function WellGrid({
  weekStart,
  highlight,
  myCustomerId,
  onCellClick,
  onBadgeClick,
  paintedStatusByCell,
}: Props) {
  const [activeOnly, setActiveOnly] = useState(true);

  const gridQuery = useQuery({
    queryKey: ["worksurface", "well-grid", weekStart],
    queryFn: () =>
      api
        .get<{ success: boolean; data: GridPayload }>(
          weekStart ? `/diag/well-grid?weekStart=${weekStart}` : `/diag/well-grid`,
        )
        .then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const visibleRows = useMemo(() => {
    if (!gridQuery.data) return [];
    let rows = gridQuery.data.rows;
    if (activeOnly) {
      rows = rows.filter((r) => r.days.some((d) => d && d.loadCount > 0));
    }
    if (highlight === "mine_only" && myCustomerId != null) {
      rows = rows.filter((r) => r.customerId === myCustomerId);
    }
    return rows;
  }, [gridQuery.data, activeOnly, highlight, myCustomerId]);

  const isDimmed = (row: GridRow): boolean => {
    if (highlight === "all" || highlight === "mine_only") return false;
    return row.customerId !== highlight;
  };

  if (!gridQuery.data) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-6 text-sm text-text-secondary">
        Loading grid...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {visibleRows.length} of {gridQuery.data.rowCount} wells · {gridQuery.data.totalCells} active cells this week
        </span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active rows only
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left uppercase tracking-wide text-text-secondary border-b border-border">
              <th className="py-2 pl-3 pr-3 text-xs">Bill To / Well</th>
              {DOW_LABELS.map((d) => (
                <th key={d} className="py-2 px-1 text-center w-12 text-xs">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.wellId}
                className={`border-b border-border/40 ${isDimmed(row) ? "opacity-40" : ""}`}
              >
                <td className="py-1.5 pl-3 pr-3">
                  <div className="text-xs text-text-secondary">{row.billTo ?? "—"}</div>
                  <div className="text-sm font-medium">{row.wellName}</div>
                </td>
                {row.days.map((cell, idx) => (
                  <td key={idx} className="py-1.5 px-1 text-center">
                    {cell ? (
                      <WellGridCell
                        loadCount={cell.loadCount}
                        derivedStatus={cell.derivedStatus}
                        paintedStatus={paintedStatusByCell?.get(`${cell.wellId}-${cell.dow}`)}
                        onClick={() => onCellClick(cell.wellId, cell.dow)}
                        onBadgeClick={() => onBadgeClick(cell.wellId, cell.dow)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCellClick(row.wellId, idx)}
                        className="w-10 h-7 rounded border border-border/40 bg-bg-primary/40 text-[10px] text-text-secondary hover:border-border"
                      >
                        ·
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.8: Rewrite `Workbench.tsx`** — full replacement

First read the existing user-customer mapping pattern; then replace the file. The new shell:

```typescript
// frontend/src/pages/Workbench.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCurrentUser } from "../hooks/use-auth";
import { useHeartbeat } from "../hooks/use-presence";
import { WorksurfaceTopStrip } from "../components/WorksurfaceTopStrip";
import { UserHighlightStrip } from "../components/UserHighlightStrip";
import { WellGrid } from "../components/WellGrid";
import { InboxSection } from "../components/InboxSection";
import { TodayIntakeSection } from "../components/TodayIntakeSection";
import { JennyQueueSection } from "../components/JennyQueueSection";

interface Customer {
  id: number;
  name: string;
}

const HIGHLIGHT_STORAGE_KEY = "worksurface.highlight";

export function Workbench() {
  useHeartbeat({ currentPage: "workbench" });
  const [searchParams, setSearchParams] = useSearchParams();
  const userQuery = useCurrentUser();
  const me = userQuery.data;

  // Fetch customers for the highlight strip + user→customer mapping
  const customersQuery = useQuery({
    queryKey: ["worksurface", "customers"],
    queryFn: () =>
      api
        .get<{ success: boolean; data: { customers: Customer[] } }>(
          "/customers",
        )
        .then((r) => r.data.customers),
    staleTime: 5 * 60_000,
  });
  const customers = customersQuery.data ?? [];

  // Fetch builder-routing to find current user's primary customer
  const routingQuery = useQuery({
    queryKey: ["worksurface", "routing"],
    queryFn: () =>
      api
        .get<{
          success: boolean;
          data: { matrix: Array<{ builder: string; customerId: number | null; isPrimary: boolean }> };
        }>("/diag/builder-matrix")
        .then((r) => r.data.matrix),
    staleTime: 5 * 60_000,
  });
  const myCustomerId = useMemo(() => {
    const builders = routingQuery.data ?? [];
    const myBuilderName = (me?.email ?? "").split("@")[0]; // e.g., "scout" from "scout@..."
    const match = builders.find(
      (b) =>
        b.isPrimary &&
        b.builder.toLowerCase() === myBuilderName.toLowerCase(),
    );
    return match?.customerId ?? null;
  }, [routingQuery.data, me]);

  // URL state — week, highlight
  const weekStart = searchParams.get("week") ?? undefined;
  const urlHighlight = searchParams.get("highlight");

  // Highlight state — URL > localStorage > customer-default > "all"
  const [highlight, setHighlight] = useState<number | "all" | "mine_only">(() => {
    if (urlHighlight === "all" || urlHighlight === "mine_only") return urlHighlight;
    if (urlHighlight && /^\d+$/.test(urlHighlight)) return parseInt(urlHighlight, 10);
    const stored = localStorage.getItem(HIGHLIGHT_STORAGE_KEY);
    if (stored === "all" || stored === "mine_only") return stored;
    if (stored && /^\d+$/.test(stored)) return parseInt(stored, 10);
    return "all"; // default until myCustomerId loads
  });

  // Apply customer-default once on first load if no URL/localStorage state
  useEffect(() => {
    if (urlHighlight) return;
    if (localStorage.getItem(HIGHLIGHT_STORAGE_KEY)) return;
    if (myCustomerId != null) setHighlight(myCustomerId);
  }, [myCustomerId, urlHighlight]);

  // Persist highlight changes to localStorage
  useEffect(() => {
    localStorage.setItem(HIGHLIGHT_STORAGE_KEY, String(highlight));
  }, [highlight]);

  const handleHighlight = (next: number | "all" | "mine_only") => {
    setHighlight(next);
    const sp = new URLSearchParams(searchParams);
    sp.set("highlight", String(next));
    setSearchParams(sp);
  };

  // Inbox customer filter — Jess (admin manager) sees everything;
  // builders see only their primary customer
  const inboxCustomerIds = useMemo(() => {
    if (me?.role === "admin" && (me.email?.startsWith("jryan") || me.email?.startsWith("jess"))) {
      return [] as number[]; // manager view
    }
    return myCustomerId != null ? [myCustomerId] : [];
  }, [me, myCustomerId]);

  // Cell-click → drawer (drawer wiring lands in Task 4)
  const [openCell, setOpenCell] = useState<{ wellId: number; dow: number } | null>(null);
  const handleCellClick = (wellId: number, dow: number) => {
    setOpenCell({ wellId, dow });
    // Drawer mount happens in Task 4
  };
  const handleBadgeClick = (wellId: number, dow: number) => {
    // Flag + open drawer — wired in Task 4
    setOpenCell({ wellId, dow });
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 gap-3 max-w-[1600px] w-full mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Worksurface</h1>
        <div className="text-xs text-text-secondary">
          {me?.email ? `Signed in as ${me.email}` : ""}
        </div>
      </header>

      <WorksurfaceTopStrip
        weekStart={weekStart}
        onBuilderClick={(custId) => handleHighlight(custId ?? "all")}
      />

      <UserHighlightStrip
        customers={customers}
        highlight={highlight}
        onHighlight={handleHighlight}
        myCustomerId={myCustomerId}
      />

      <WellGrid
        weekStart={weekStart}
        highlight={highlight}
        myCustomerId={myCustomerId}
        onCellClick={handleCellClick}
        onBadgeClick={handleBadgeClick}
      />

      <InboxSection customerIds={inboxCustomerIds} />
      <TodayIntakeSection />
      <JennyQueueSection />

      {/* Drawer mounted in Task 4 */}
      {openCell && (
        <div className="fixed bottom-4 right-4 px-3 py-2 rounded-md bg-bg-secondary border border-border text-xs">
          Cell {openCell.wellId}/{openCell.dow} clicked — drawer in Task 4
          <button
            type="button"
            onClick={() => setOpenCell(null)}
            className="ml-2 text-accent"
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3.9: Verify customers endpoint exists**

```bash
grep -n "fastify.get(\"/customers\"\|app.get.*customers" /home/jryan/projects/work/esexpress-v2/backend/src/plugins/customers/routes/*.ts /home/jryan/projects/work/esexpress-v2/backend/src/app.ts 2>/dev/null | head -5
```

If no `/customers` endpoint exists, add a minimal one in `diag.ts`:

```typescript
// GET /customers — list active customers for UI selectors
fastify.get("/customers", async (_request, reply) => {
  const db = fastify.db;
  if (!db)
    return reply.status(503).send({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "DB not connected" },
    });
  const { sql } = await import("drizzle-orm");
  const rows = (await db.execute(sql`
      SELECT id, name FROM customers WHERE active = true ORDER BY name
    `)) as unknown as Array<{ id: number; name: string }>;
  return { success: true, data: { customers: rows } };
});
```

The frontend code uses `/customers` but the backend route would actually be `/diag/customers`. **Fix the frontend hook URL** to use `/diag/customers`:

In `Workbench.tsx`, change:

```typescript
.get<{...}>("/customers")
```

to:

```typescript
.get<{...}>("/diag/customers")
```

- [ ] **Step 3.10: Build frontend + type-check**

```bash
cd /home/jryan/projects/work/esexpress-v2/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in N.NNs`. Any TS errors → fix and re-run.

- [ ] **Step 3.11: Commit + push + deploy**

```bash
cd /home/jryan/projects/work/esexpress-v2
git add backend/src/plugins/diagnostics/routes/diag.ts \
        frontend/src/components/WorksurfaceTopStrip.tsx \
        frontend/src/components/UserHighlightStrip.tsx \
        frontend/src/components/WellGrid.tsx \
        frontend/src/components/WellGridCell.tsx \
        frontend/src/components/InboxSection.tsx \
        frontend/src/components/TodayIntakeSection.tsx \
        frontend/src/components/JennyQueueSection.tsx \
        frontend/src/pages/Workbench.tsx
git commit -m "feat(worksurface): unified shell with top strip + grid + 3 stub sections

Wave 1 of unified worksurface. Workbench rewrite mounts:
- Builder Matrix top strip (mirrors /admin/builder-matrix)
- User-filter highlight pills
- Well grid with dual-color cells (sheet-painted + v2-derived)
- Three collapsing sections (Inbox/Intake/Jenny — stubs filled in Tasks 5-7)

Drawer mount = stub toast for now; Task 4 extends WorkbenchDrawer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
vercel deploy --prod --yes 2>&1 | grep -E "Production|Aliased" | head -3
```

- [ ] **Step 3.12: Open `/workbench` in browser to smoke**

URL: https://app.esexpressllc.com/workbench

Expected: top strip renders with the Order of Invoicing matrix; highlight pills appear; well grid renders with cells. Click a cell → bottom-right toast "Cell N/M clicked".

---

## Task 4 — Frontend: extend `WorkbenchDrawer` with cell-summary + action bar

**Estimate:** 2hr · **Dependencies:** Task 3 · **File:** `frontend/src/components/WorkbenchDrawer.tsx`

Wire the drawer into Workbench's cell-click. Drawer gets a cell-summary header (when opened from a cell) and a context-aware action bar that changes verbatim with the v2-derived status.

**Files:**

- Read: `frontend/src/components/WorkbenchDrawer.tsx` (lines 75-100, 320-380 for prop interface and entry render)
- Modify: `frontend/src/components/WorkbenchDrawer.tsx` (add optional `cellContext` prop + cell-summary header + action bar)
- Modify: `frontend/src/pages/Workbench.tsx` (replace stub toast with real `<WorkbenchDrawer cellContext={...} />` mount)

- [ ] **Step 4.1: Read existing WorkbenchDrawer interface**

```bash
sed -n '70,100p' /home/jryan/projects/work/esexpress-v2/frontend/src/components/WorkbenchDrawer.tsx
sed -n '320,360p' /home/jryan/projects/work/esexpress-v2/frontend/src/components/WorkbenchDrawer.tsx
```

Note the `WorkbenchDrawerProps` interface at line 75 and the `WorkbenchDrawer` function start at line 320. The new prop must be optional so existing call sites stay working.

- [ ] **Step 4.2: Add `cellContext` prop to WorkbenchDrawerProps**

In `frontend/src/components/WorkbenchDrawer.tsx`, find the `interface WorkbenchDrawerProps {` declaration (around line 75) and add:

```typescript
interface WorkbenchDrawerProps {
  // ... existing props ...
  cellContext?: CellContext;
}

export interface CellContext {
  wellId: number;
  wellName: string;
  billTo: string | null;
  weekStart: string;
  dow: number; // 0..6 (Sun-Sat)
  loadCount: number;
  derivedStatus: string;
  paintedStatus?: string | null;
  onConfirm?: () => void;
  onMatchBol?: () => void;
  onAssignDriver?: () => void;
  onAddComment?: () => void;
  onClose: () => void;
}
```

- [ ] **Step 4.3: Add CellSummaryHeader + ActionBar render block**

Inside the WorkbenchDrawer's main JSX render (find the drawer container at ~line 350-400), add this block at the top of the drawer body, conditionally rendered when `cellContext` is provided:

```typescript
{cellContext && (
  <div className="border-b border-border bg-bg-secondary p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs text-text-secondary">{cellContext.billTo ?? "—"}</div>
        <h2 className="text-lg font-semibold">{cellContext.wellName}</h2>
        <div className="text-xs text-text-secondary mt-1">
          {(() => {
            const d = new Date(cellContext.weekStart + "T00:00:00");
            d.setDate(d.getDate() + cellContext.dow);
            return d.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });
          })()}
        </div>
      </div>
      <button
        type="button"
        onClick={cellContext.onClose}
        className="text-text-secondary hover:text-text-primary"
        aria-label="Close drawer"
      >
        ✕
      </button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-md border border-border bg-bg-primary/40 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-text-secondary">
          v2 status
        </div>
        <div className="font-semibold">{cellContext.derivedStatus.replace(/_/g, " ")}</div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary/40 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-text-secondary">
          v2 count
        </div>
        <div className="font-semibold">{cellContext.loadCount}</div>
      </div>
      {cellContext.paintedStatus && (
        <div className="col-span-2 rounded-md border border-border bg-bg-primary/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-text-secondary">
            sheet-painted
          </div>
          <div className="font-semibold">{cellContext.paintedStatus.replace(/_/g, " ")}</div>
        </div>
      )}
    </div>
    {/* Action bar — context-aware on derivedStatus */}
    <div className="mt-3 flex flex-wrap gap-2">
      {cellContext.derivedStatus === "missing_tickets" && (
        <button
          type="button"
          onClick={cellContext.onMatchBol}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90"
        >
          Match BOL
        </button>
      )}
      {cellContext.derivedStatus === "missing_driver" && (
        <button
          type="button"
          onClick={cellContext.onAssignDriver}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90"
        >
          Assign Driver
        </button>
      )}
      {cellContext.derivedStatus === "loads_being_built" && (
        <button
          type="button"
          onClick={cellContext.onConfirm}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90"
        >
          Confirm
        </button>
      )}
      {cellContext.derivedStatus === "loads_completed" && (
        <button
          type="button"
          disabled
          className="px-3 py-1.5 text-sm rounded-md bg-bg-tertiary text-text-secondary border border-border opacity-60 cursor-not-allowed"
          title="PCS push awaiting enablement"
        >
          Push to PCS
        </button>
      )}
      {cellContext.derivedStatus === "need_rate_info" && (
        <a
          href={`/wells/${cellContext.wellId}`}
          className="px-3 py-1.5 text-sm rounded-md bg-amber-500 text-white hover:opacity-90"
        >
          → Set rate on Well page
        </a>
      )}
      <button
        type="button"
        onClick={cellContext.onAddComment}
        className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg-primary hover:bg-bg-tertiary"
      >
        Add Comment
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4.4: Wire drawer into Workbench**

In `frontend/src/pages/Workbench.tsx`, replace the bottom-right stub toast with a real WorkbenchDrawer mount. Add import at top:

```typescript
import {
  WorkbenchDrawer,
  type CellContext,
} from "../components/WorkbenchDrawer";
```

Add a query to look up the cell's context once `openCell` is set. Insert near the bottom of the Workbench function body, right before `return`:

```typescript
const cellContextQuery = useQuery({
  queryKey: [
    "worksurface",
    "cell-context",
    openCell?.wellId,
    openCell?.dow,
    weekStart,
  ],
  queryFn: () => {
    if (!openCell) return null;
    return api
      .get<{
        success: boolean;
        data: {
          rows: Array<{
            wellId: number;
            wellName: string;
            billTo: string | null;
            days: Array<{
              dow: number;
              loadCount: number;
              derivedStatus: string;
            } | null>;
          }>;
        };
      }>(
        weekStart
          ? `/diag/well-grid?weekStart=${weekStart}`
          : `/diag/well-grid`,
      )
      .then((r) => {
        const row = r.data.rows.find((x) => x.wellId === openCell.wellId);
        if (!row) return null;
        const cell = row.days[openCell.dow];
        return {
          wellId: row.wellId,
          wellName: row.wellName,
          billTo: row.billTo,
          loadCount: cell?.loadCount ?? 0,
          derivedStatus: cell?.derivedStatus ?? "unknown",
        };
      });
  },
  enabled: !!openCell,
});
```

Replace the stub toast block:

```typescript
{openCell && cellContextQuery.data && (
  <WorkbenchDrawer
    /* existing props per WorkbenchDrawer signature — pass minimum required */
    cellContext={{
      wellId: cellContextQuery.data.wellId,
      wellName: cellContextQuery.data.wellName,
      billTo: cellContextQuery.data.billTo,
      weekStart: weekStart ?? new Date().toISOString().slice(0, 10),
      dow: openCell.dow,
      loadCount: cellContextQuery.data.loadCount,
      derivedStatus: cellContextQuery.data.derivedStatus,
      onConfirm: () => alert("Confirm — wired in Phase 1.5"),
      onMatchBol: () => alert("Match BOL — wired in Phase 1.5"),
      onAssignDriver: () => alert("Assign Driver — wired in Phase 1.5"),
      onAddComment: () => alert("Add Comment — wired in Phase 1.5"),
      onClose: () => setOpenCell(null),
    }}
  />
)}
```

(NOTE: existing `WorkbenchDrawer` may need other required props per its current signature. Read those at the start of this Task and pass `null`/`undefined` defaults for non-cell-mode props, OR temporarily make them optional in the same edit. The minimum-viable-Wave-1 pattern is: drawer renders cell summary + action bar with onClick handlers that alert(); per-load list deferred to Phase 1.5 once the cell-summary works.)

- [ ] **Step 4.5: Build + commit + deploy**

```bash
cd /home/jryan/projects/work/esexpress-v2/frontend && npm run build 2>&1 | tail -3
cd /home/jryan/projects/work/esexpress-v2
git add frontend/src/components/WorkbenchDrawer.tsx frontend/src/pages/Workbench.tsx
git commit -m "feat(worksurface): drawer cell-summary header + context-aware action bar

WorkbenchDrawer now accepts optional cellContext prop. When opened from
a cell (vs the existing per-load entry path), drawer renders a cell-summary
header with v2 status / count / sheet-painted status, plus an action bar
whose primary button changes verbatim with derivedStatus. Per-load actions
will be wired in Phase 1.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
vercel deploy --prod --yes 2>&1 | grep -E "Production|Aliased" | head -3
```

- [ ] **Step 4.6: Smoke**

Open `/workbench`, click a cell with loads. Drawer should slide in showing:

- Bill To + well name + day-of-week
- v2 status + count tiles
- Action bar with the right primary button (Confirm/Match BOL/etc.)
- Add Comment button

---

## Task 5 — Frontend: fill `InboxSection` with real data

**Estimate:** 1.5hr · **Dependencies:** Task 2, 3 · **File:** `frontend/src/components/InboxSection.tsx`

Replace the stub with a query to `/diag/inbox?customerIds=...`, render groups with click-to-open-drawer behavior.

**Files:**

- Modify: `frontend/src/components/InboxSection.tsx`

- [ ] **Step 5.1: Replace stub with real implementation**

```typescript
// frontend/src/components/InboxSection.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface InboxItem {
  kind: string;
  load_id?: number;
  assignment_id?: number | null;
  well_id?: number | null;
  well_name?: string | null;
  bill_to?: string | null;
  day?: string | null;
  driver_name?: string | null;
  bol_no?: string | null;
  ticket_no?: string | null;
  discrepancy_id?: number;
  message?: string;
  severity?: string;
}

interface InboxPayload {
  customerIds: number[];
  urgencyOrder: string[];
  items: {
    missing_photos: InboxItem[];
    uncertain_matches: InboxItem[];
    pcs_discrepancies: InboxItem[];
    sheet_drift: InboxItem[];
  };
  counts: {
    missing_photos: number;
    uncertain_matches: number;
    pcs_discrepancies: number;
    sheet_drift: number;
    total: number;
  };
}

const SECTION_LABELS: Record<string, string> = {
  missing_photos: "Missing photos",
  uncertain_matches: "Uncertain matches",
  pcs_discrepancies: "PCS discrepancies",
  sheet_drift: "Sheet drift",
};

interface Props {
  customerIds: number[];
  onItemClick?: (item: InboxItem) => void;
}

export function InboxSection({ customerIds, onItemClick }: Props) {
  const [open, setOpen] = useState(false);

  const inboxQuery = useQuery({
    queryKey: ["worksurface", "inbox", customerIds.join(",")],
    queryFn: () =>
      api
        .get<{ success: boolean; data: InboxPayload }>(
          customerIds.length > 0
            ? `/diag/inbox?customerIds=${customerIds.join(",")}`
            : `/diag/inbox`,
        )
        .then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const data = inboxQuery.data;
  const total = data?.counts.total ?? 0;

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide">Your Inbox</span>
          {total > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white font-bold">
              {total}
            </span>
          )}
        </span>
        <span className="text-xs text-text-secondary">{open ? "Collapse ↑" : "Expand ↓"}</span>
      </button>
      {open && data && (
        <div className="p-4 border-t border-border space-y-3">
          {total === 0 && (
            <p className="text-xs text-text-secondary text-center py-3">
              Nothing needs you. Check the Today's Intake section for fresh BOL submissions.
            </p>
          )}
          {(["missing_photos", "uncertain_matches", "pcs_discrepancies", "sheet_drift"] as const).map(
            (key) => {
              const items = data.items[key];
              if (items.length === 0) return null;
              return (
                <div key={key}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                    {SECTION_LABELS[key]} ({items.length})
                  </h3>
                  <ul className="space-y-1">
                    {items.slice(0, 10).map((item, idx) => (
                      <li
                        key={`${key}-${idx}`}
                        className="rounded-md border border-border bg-bg-primary/40 px-3 py-2 text-sm cursor-pointer hover:bg-bg-tertiary"
                        onClick={() => onItemClick?.(item)}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <div>
                            <span className="text-xs text-text-secondary">
                              {item.bill_to ?? "—"} ·{" "}
                            </span>
                            <span className="font-medium">{item.well_name ?? "—"}</span>
                            {item.day && (
                              <span className="text-xs text-text-secondary ml-2">
                                {new Date(item.day).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {item.driver_name && (
                            <span className="text-xs text-text-secondary">
                              {item.driver_name}
                            </span>
                          )}
                        </div>
                        {item.message && (
                          <div className="text-xs text-text-secondary mt-0.5">{item.message}</div>
                        )}
                      </li>
                    ))}
                    {items.length > 10 && (
                      <li className="text-xs text-text-secondary text-center pt-1">
                        + {items.length - 10} more
                      </li>
                    )}
                  </ul>
                </div>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5.2: Wire `onItemClick` in Workbench to open drawer**

In `frontend/src/pages/Workbench.tsx`, change the Inbox mount:

```typescript
<InboxSection
  customerIds={inboxCustomerIds}
  onItemClick={(item) => {
    if (item.well_id != null && item.day) {
      const itemDate = new Date(item.day);
      const week = weekStart ? new Date(weekStart) : new Date();
      const dow = Math.floor(
        (itemDate.getTime() - week.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (dow >= 0 && dow < 7) {
        setOpenCell({ wellId: item.well_id, dow });
      }
    }
  }}
/>
```

- [ ] **Step 5.3: Build + commit + deploy**

```bash
cd /home/jryan/projects/work/esexpress-v2/frontend && npm run build 2>&1 | tail -3
cd /home/jryan/projects/work/esexpress-v2
git add frontend/src/components/InboxSection.tsx frontend/src/pages/Workbench.tsx
git commit -m "feat(worksurface): InboxSection — workflow-first needs-you items

Reads from /diag/inbox; collapses by default; shows badge with total count;
click any item → opens drawer for that load's cell. Customer filter respects
builder→customer mapping (manager view = no filter).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
vercel deploy --prod --yes 2>&1 | grep -E "Production|Aliased" | head -3
```

- [ ] **Step 5.4: Smoke**

Open `/workbench`, expand Your Inbox. Should show items grouped by kind with workflow-first ordering.

---

## Task 6 — Frontend: fill `TodayIntakeSection` with real data

**Estimate:** 1.5hr · **Dependencies:** Task 3 · **File:** `frontend/src/components/TodayIntakeSection.tsx`

Use the existing `useBolQueue` hook (filter to last 4hr items) + reuse `ManualMatchPanel` as-is for unmatched items.

**Files:**

- Read: `frontend/src/hooks/use-bol.ts` (find `useBolQueue` signature)
- Modify: `frontend/src/components/TodayIntakeSection.tsx`

- [ ] **Step 6.1: Read existing hook signature**

```bash
grep -n "export function useBolQueue\|useBolQueue:\|export const useBolQueue" /home/jryan/projects/work/esexpress-v2/frontend/src/hooks/use-bol.ts | head -5
sed -n '1,80p' /home/jryan/projects/work/esexpress-v2/frontend/src/hooks/use-bol.ts | head -100
```

Note the data shape returned. The Today's Intake rendering filters its results to the last 4 hours by `submittedAt`/`createdAt`.

- [ ] **Step 6.2: Replace stub**

```typescript
// frontend/src/components/TodayIntakeSection.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBolQueue } from "../hooks/use-bol";
import { ManualMatchPanel } from "./ManualMatchPanel";
import { resolvePhotoUrl } from "../lib/photo-url";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

interface Props {
  onMatchedClick?: (loadId: number) => void;
}

export function TodayIntakeSection({ onMatchedClick }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedSubId, setExpandedSubId] = useState<number | null>(null);

  // useBolQueue may have a different signature in this codebase. Adjust
  // the call to match. Most likely: useBolQueue({ status: "all", limit: 50 })
  const queueQuery = useBolQueue({});

  const recentItems = useMemo(() => {
    const items = (queueQuery.data?.items ?? []) as Array<{
      submission: {
        id: number;
        bolNumber: string | null;
        driverName: string | null;
        photoUrls: string[];
        submittedAt: string | null;
      };
      load?: { id: number; loadNo: string | null } | null;
    }>;
    const cutoff = Date.now() - FOUR_HOURS_MS;
    return items.filter((x) => {
      if (!x.submission.submittedAt) return false;
      return new Date(x.submission.submittedAt).getTime() >= cutoff;
    });
  }, [queueQuery.data]);

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide">Today's Intake</span>
          {recentItems.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-bg-primary border border-border font-semibold">
              {recentItems.length}
            </span>
          )}
        </span>
        <span className="text-xs text-text-secondary">{open ? "Collapse ↑" : "Expand ↓"}</span>
      </button>
      {open && (
        <div className="p-4 border-t border-border space-y-2">
          {recentItems.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-3">
              No BOL submissions in the last 4 hours.
            </p>
          )}
          {recentItems.map((item) => {
            const sub = item.submission;
            const matched = !!item.load;
            const expanded = expandedSubId === sub.id;
            return (
              <div
                key={sub.id}
                className="rounded-md border border-border bg-bg-primary/40 p-3"
              >
                <div className="flex items-center gap-3">
                  {sub.photoUrls?.[0] && (
                    <img
                      src={resolvePhotoUrl(sub.photoUrls[0])}
                      alt="BOL"
                      className="w-12 h-12 object-cover rounded border border-border flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {sub.driverName ?? "—"} · BOL {sub.bolNumber ?? "—"}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {sub.submittedAt
                        ? new Date(sub.submittedAt).toLocaleTimeString()
                        : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    {matched ? (
                      <button
                        type="button"
                        onClick={() => item.load && onMatchedClick?.(item.load.id)}
                        className="text-xs text-accent hover:underline"
                      >
                        → matched to LOAD-{item.load!.loadNo ?? item.load!.id}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedSubId(expanded ? null : sub.id)}
                        className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:opacity-90"
                      >
                        {expanded ? "Hide match panel" : "Manual match"}
                      </button>
                    )}
                  </div>
                </div>
                {expanded && !matched && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <ManualMatchPanel importId={sub.id} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-2 text-right">
            <Link
              to="/bol"
              className="text-xs text-accent underline-offset-4 hover:underline"
            >
              All BOL items →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
```

NOTE: `useBolQueue` signature may differ (e.g., needs `(filters)` argument). Read the hook source in Step 6.1 and adjust the call. If hook expects `{ status, page, pageSize }`, pass `{ status: "all", page: 1, pageSize: 100 }`.

- [ ] **Step 6.3: Build + commit + deploy**

```bash
cd /home/jryan/projects/work/esexpress-v2/frontend && npm run build 2>&1 | tail -3
cd /home/jryan/projects/work/esexpress-v2
git add frontend/src/components/TodayIntakeSection.tsx frontend/src/pages/Workbench.tsx
git commit -m "feat(worksurface): TodayIntakeSection — last 4hr BOL/JotForm landings

Reuses existing useBolQueue hook + ManualMatchPanel component verbatim
(per spec: ManualMatchPanel already a clean reusable component, used
in BolQueue + AwaitingPhotoMatch). Filters items to last 4hr by
submittedAt. Footer link to /bol for the deeper view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
vercel deploy --prod --yes 2>&1 | grep -E "Production|Aliased" | head -3
```

- [ ] **Step 6.4: Smoke**

Expand Today's Intake. Should show recent submissions with photo thumbs. Click "Manual match" on an unmatched item → ManualMatchPanel renders inline.

---

## Task 7 — Frontend: fill `JennyQueueSection` + route redirect + cleanup

**Estimate:** 1.5hr · **Dependencies:** Task 3 · **Files:** several

Three things in this task: fill the Jenny's Queue section, replace `/validation` route with redirect, remove Validation entries from Sidebar.

**Files:**

- Modify: `frontend/src/components/JennyQueueSection.tsx`
- Modify: `frontend/src/app.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 7.1: Fill JennyQueueSection**

```typescript
// frontend/src/components/JennyQueueSection.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface QueuePayload {
  totalNonStandard: number;
  categories: Array<{
    category: string;
    total: number;
    rows: Array<{ bill_to: string | null; load_count: number; last_seen: string | null }>;
  }>;
  samples: Array<{
    id: number;
    job_category: string;
    load_no: string | null;
    delivered_on: string | null;
    bill_to: string | null;
    driver_name: string | null;
  }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  truck_pusher: "Truck Pushers",
  equipment_move: "Equipment Moves",
  flatbed: "Flatbed Loads",
  frac_chem: "Frac Chem",
  finoric: "Finoric",
  joetex: "JoeTex",
  panel_truss: "Panel Truss",
  other: "Other",
};

interface Props {
  onLoadClick?: (loadId: number) => void;
}

export function JennyQueueSection({ onLoadClick }: Props) {
  const [open, setOpen] = useState(false);

  const queueQuery = useQuery({
    queryKey: ["worksurface", "jenny-queue"],
    queryFn: () =>
      api
        .get<{ success: boolean; data: QueuePayload }>("/diag/jenny-queue")
        .then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = queueQuery.data;
  const total = data?.totalNonStandard ?? 0;

  return (
    <section className="rounded-lg border border-border bg-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide">Jenny's Queue</span>
          {total > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-bg-primary border border-border font-semibold">
              {total}
            </span>
          )}
        </span>
        <span className="text-xs text-text-secondary">{open ? "Collapse ↑" : "Expand ↓"}</span>
      </button>
      {open && data && (
        <div className="p-4 border-t border-border space-y-3">
          {data.categories.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-3">
              No non-standard work right now.
            </p>
          )}
          {data.categories.map((cat) => (
            <div key={cat.category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                {CATEGORY_LABELS[cat.category] ?? cat.category} ({cat.total})
              </h3>
              <ul className="space-y-1">
                {cat.rows.map((r, idx) => (
                  <li
                    key={`${cat.category}-${idx}`}
                    className="rounded-md border border-border bg-bg-primary/40 px-3 py-1.5 text-sm flex items-baseline justify-between"
                  >
                    <span>{r.bill_to ?? "(unattributed)"}</span>
                    <span className="tabular-nums font-semibold">{r.load_count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data.samples.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                Recent
              </h3>
              <ul className="space-y-1">
                {data.samples.slice(0, 10).map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-border bg-bg-primary/40 px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-tertiary"
                    onClick={() => onLoadClick?.(s.id)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <span className="text-xs text-text-secondary">
                          {s.delivered_on ? new Date(s.delivered_on).toLocaleDateString() : "—"} ·{" "}
                        </span>
                        <span className="font-medium">{CATEGORY_LABELS[s.job_category] ?? s.job_category}</span>
                      </div>
                      <span className="text-xs text-text-secondary">{s.driver_name ?? "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 7.2: Wire JennyQueue mount in Workbench**

In `frontend/src/pages/Workbench.tsx`:

```typescript
<JennyQueueSection
  onLoadClick={(loadId) => {
    // Phase 1.5: lookup load → cell context → open drawer.
    // For Wave 1, just show alert; Phase 2.5 wires the click.
    alert(`Load ${loadId} — drawer-open from Jenny's Queue is Phase 1.5`);
  }}
/>
```

- [ ] **Step 7.3: Replace `/validation` route with redirect**

In `frontend/src/app.tsx`, find the `/validation` route. Change:

```typescript
<Route path="validation" element={<Validation />} />
```

to:

```typescript
<Route path="validation" element={<Navigate to="/workbench" replace />} />
```

Add `Navigate` import at the top:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
```

(adjust to existing react-router-dom imports — `Navigate` likely already used elsewhere.)

- [ ] **Step 7.4: Remove "Validate" sidebar entry**

In `frontend/src/components/Sidebar.tsx`, find the Validate Link element and delete the block. Search for `/validation` and remove the surrounding `<Link>` and any wrapper `div`/`li` if present.

```bash
grep -n "/validation\|Validate" /home/jryan/projects/work/esexpress-v2/frontend/src/components/Sidebar.tsx | head -5
```

Read the surrounding lines and delete the Link block cleanly.

- [ ] **Step 7.5: Build + final smoke + commit + deploy**

```bash
cd /home/jryan/projects/work/esexpress-v2/frontend && npm run build 2>&1 | tail -3
cd /home/jryan/projects/work/esexpress-v2
git add frontend/src/components/JennyQueueSection.tsx \
        frontend/src/pages/Workbench.tsx \
        frontend/src/app.tsx \
        frontend/src/components/Sidebar.tsx
git commit -m "feat(worksurface): JennyQueueSection + /validation redirect + Sidebar cleanup

JennyQueueSection mirrors /admin/jenny-queue but inline + clickable.
/validation route now redirects to /workbench (Wave 1 absorbs Validation
into the worksurface drawer per spec).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push lexcom main
vercel deploy --prod --yes 2>&1 | grep -E "Production|Aliased" | head -3
```

- [ ] **Step 7.6: Final acceptance smoke** (per spec §"Acceptance criteria")

Run each acceptance check on https://app.esexpressllc.com/workbench logged in as `jryan@esexpress.com`:

1. ✅ `/workbench` loads with top strip + grid + 3 collapsed sections
2. ✅ Top strip totals match `/admin/builder-matrix` (both should be live SQL — open both tabs and compare)
3. ✅ Well grid shows ≥10 cells with values
4. ✅ Click a cell with loads → drawer opens with cell-summary
5. ✅ "Confirm" button on `loads_being_built` cell → alert (Phase 1.5 wires actual write)
6. ✅ Inbox section for `jryan@esexpress.com` (admin/manager view) shows ≥1 item
7. ✅ Today's Intake shows recent JotForm submissions
8. ✅ Jenny's Queue section shows the 10 equipment_move loads
9. ✅ `/validation` redirects to `/workbench`
10. ⚠️ Sheet-drift mismatch cells show badge (only if `paintedStatusByCell` is wired — Phase 1.5 reads `/diag/sheet-status` to populate this map; Wave 1 ships single-color cells with badge code present but no painted-status data)

If item 10 fails, that's an acceptable Wave 1 cut — the dual-color/badge behavior was the spec's "fallback D" (hide on worksurface, surface only on `/admin/sheet-status`). Document in PR description.

---

## Self-Review

After writing the plan above, here's the spec-coverage checklist:

| Spec section                       | Task that implements it                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| §"Top Strip"                       | Task 3, Step 3.4 (`WorksurfaceTopStrip.tsx`)                    |
| §"Main Canvas — Well Grid"         | Task 3, Steps 3.6 + 3.7 (`WellGridCell.tsx` + `WellGrid.tsx`)   |
| §"Drawer (right-side slide-in)"    | Task 4 (extends `WorkbenchDrawer.tsx`)                          |
| §"Three Expand-Down Sections"      | Tasks 5, 6, 7 (Inbox/Intake/JennyQueue)                         |
| §"User-Filter Highlight Strip"     | Task 3, Step 3.5 (`UserHighlightStrip.tsx`)                     |
| §"Read path"                       | Tasks 1 (well-grid) + 2 (inbox); other endpoints already exist  |
| §"Lifecycle → Computed Color Rule" | Task 1 `deriveStatus()` function                                |
| §"Mismatch badge suppression"      | Task 3, Step 3.6 `stageDistance()`                              |
| §"URL & state"                     | Task 3 Workbench (handles `?week`, `?highlight`, `?cell`)       |
| §"Out of Scope"                    | Honored — no BolQueue rewrite, no LoadReport changes, no schema |
| §"Acceptance criteria"             | Task 7 Step 7.6                                                 |

**Placeholder scan:** Inline `alert()` calls in handlers (Confirm/Match BOL/Assign Driver) are explicit "Phase 1.5" placeholders — flagged as such in commit messages and in the alert text. Acceptable per Wave 1 cut.

**Type consistency:** `CellContext` interface defined in Task 4.2 used in Task 4.4 mount. `InboxItem` shape mirrors `/diag/inbox` response (Task 2 endpoint). `WellGrid`'s `paintedStatusByCell` Map prop is unused in Wave 1 (passed empty); the badge logic short-circuits on undefined. Honest with the spec's "fallback D" cut.

**Spec gap caught:** The spec's "click on badge BOTH flags discrepancy AND opens drawer" needs a `POST /discrepancies` call to flag. Wave 1 ships the click → drawer side; the "flag as discrepancy" write is deferred to Phase 1.5 (TODO comment in `WellGridCell` `onBadgeClick`). Documented in commit for Task 3.

---

## Total estimate

| Task                                | Estimate |
| ----------------------------------- | -------: |
| 1 — `/diag/well-grid`               |      2hr |
| 2 — `/diag/inbox`                   |    1.5hr |
| 3 — Workbench shell + 5 components  |      3hr |
| 4 — Drawer extension                |      2hr |
| 5 — InboxSection real               |    1.5hr |
| 6 — TodayIntakeSection real         |    1.5hr |
| 7 — JennyQueue + redirect + cleanup |    1.5hr |
| **Total**                           | **13hr** |

With ~30hr until Monday morning, that's ~2.3x safety buffer. Smoke + Sunday-evening pre-Monday scrub fits comfortably.

---

## Plan complete. Saved to `docs/superpowers/plans/2026-04-26-unified-worksurface-wave-1.md`.
