# Validation Editing + Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline well editing on the validation page (all tiers), a reusable pagination component, and backend pagination support for validation and JotForm endpoints.

**Architecture:** Two new frontend components (WellPicker, Pagination) integrated into three existing pages (Validation, BOL Queue, Dispatch Desk). Two backend endpoints get pagination support. Frontend hooks extended with suggestion fetching and manual resolve mutations.

**Tech Stack:** React 19, react-router-dom 7, @tanstack/react-query 5, Tailwind v4, Fastify 5, Drizzle ORM

---

### Task 1: Pagination Component

**Files:**

- Create: `frontend/src/components/Pagination.tsx`

- [ ] **Step 1: Create the Pagination component**

```tsx
// frontend/src/components/Pagination.tsx

const PAGE_SIZES = [25, 50, 100] as const;

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-2 py-3 text-xs text-on-surface/50">
      {/* Left: showing range */}
      <span className="font-label">
        {total === 0 ? "No results" : `Showing ${start}-${end} of ${total}`}
      </span>

      {/* Center: prev / page / next */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="px-2 py-1 rounded hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            chevron_left
          </span>
        </button>
        <span className="font-label font-bold text-on-surface/70 min-w-[80px] text-center">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className="px-2 py-1 rounded hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            chevron_right
          </span>
        </button>
      </div>

      {/* Right: page size */}
      <div className="flex items-center gap-2">
        <span className="font-label text-on-surface/30">Per page</span>
        <div className="flex rounded-lg overflow-hidden border border-on-surface/10">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onPageSizeChange(size)}
              disabled={loading}
              className={`px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                pageSize === size
                  ? "bg-primary-container/20 text-primary-container"
                  : "text-on-surface/40 hover:bg-surface-container-high"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders without errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Pagination.tsx
git commit -m "feat: add reusable Pagination component"
```

---

### Task 2: Backend — Add Pagination to Validation Tier Endpoint

**Files:**

- Modify: `backend/src/plugins/dispatch/routes/validation.ts:33-56`
- Modify: `backend/src/plugins/dispatch/services/validation.service.ts:53-112`

- [ ] **Step 1: Update the service function signature to accept pagination**

In `backend/src/plugins/dispatch/services/validation.service.ts`, change `getAssignmentsByTier` to accept `page` and `limit` params and return `{ data, total }`:

Replace the function (lines 53-112) with:

```typescript
export async function getAssignmentsByTier(
  db: Database,
  tier: number,
  opts: { page?: number; limit?: number } = {},
) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const offset = (page - 1) * limit;

  // Tier 3: return unmapped loads (no assignment) for manual resolution
  if (tier === 3) {
    const [countResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(isNull(assignments.id));

    const total = countResult?.count ?? 0;

    const data = await db
      .select({
        id: loads.id,
        wellId: sql<number>`0`.as("well_id"),
        loadId: loads.id,
        status: sql<string>`'unresolved'`.as("status"),
        autoMapTier: sql<number>`3`.as("auto_map_tier"),
        autoMapScore: sql<string | null>`null`.as("auto_map_score"),
        photoStatus: sql<string>`'missing'`.as("photo_status"),
        createdAt: loads.createdAt,
        loadNo: loads.loadNo,
        driverName: loads.driverName,
        destinationName: loads.destinationName,
        carrierName: loads.carrierName,
        weightTons: loads.weightTons,
        ticketNo: loads.ticketNo,
        bolNo: loads.bolNo,
        wellName: sql<string>`'-- Unresolved --'`.as("well_name"),
      })
      .from(loads)
      .leftJoin(assignments, eq(loads.id, assignments.loadId))
      .where(isNull(assignments.id))
      .orderBy(desc(loads.createdAt))
      .limit(limit)
      .offset(offset);

    return { data, total };
  }

  // Tier 1/2: pending assignments with matching tier
  const whereClause = and(
    eq(assignments.status, "pending"),
    eq(assignments.autoMapTier, tier),
  );

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(assignments)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  const data = await db
    .select({
      id: assignments.id,
      wellId: assignments.wellId,
      loadId: assignments.loadId,
      status: assignments.status,
      autoMapTier: assignments.autoMapTier,
      autoMapScore: assignments.autoMapScore,
      photoStatus: assignments.photoStatus,
      createdAt: assignments.createdAt,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      destinationName: loads.destinationName,
      carrierName: loads.carrierName,
      weightTons: loads.weightTons,
      ticketNo: loads.ticketNo,
      bolNo: loads.bolNo,
      wellName: wells.name,
    })
    .from(assignments)
    .innerJoin(loads, eq(assignments.loadId, loads.id))
    .innerJoin(wells, eq(assignments.wellId, wells.id))
    .where(whereClause)
    .orderBy(desc(assignments.createdAt))
    .limit(limit)
    .offset(offset);

  return { data, total };
}
```

- [ ] **Step 2: Update the route to pass pagination params and return meta**

In `backend/src/plugins/dispatch/routes/validation.ts`, update the `GET /tier/:n` handler (lines 33-56):

Add `page` and `limit` to the schema querystring:

```typescript
fastify.get(
  "/tier/:n",
  {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["n"],
        properties: {
          n: { type: "integer", minimum: 1, maximum: 3 },
        },
      },
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  },
  async (request, reply) => {
    const db = fastify.db;
    if (!db) return reply.status(503).send(DB_UNAVAILABLE);

    const { n } = request.params as { n: number };
    const { page = 1, limit = 50 } = request.query as {
      page?: number;
      limit?: number;
    };
    const { data, total } = await getAssignmentsByTier(db, n, { page, limit });
    return {
      success: true,
      data,
      meta: {
        tier: n,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
);
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/plugins/dispatch/routes/validation.ts backend/src/plugins/dispatch/services/validation.service.ts
git commit -m "feat: add pagination to validation tier endpoint"
```

---

### Task 3: Backend — Add Total Count to JotForm Queue Endpoint

**Files:**

- Modify: `backend/src/plugins/verification/routes/jotform.ts:179-285`

The endpoint already has `page`/`limit` params. It just needs a total count query and meta in the response.

- [ ] **Step 1: Add total count query and meta to the response**

In `backend/src/plugins/verification/routes/jotform.ts`, after line 217 (`const offset = ...`) and before the main query, add a count query. Then change the return on line 283 to include meta.

Add this count query after `const offset = (page - 1) * limit;` (line 216):

```typescript
const { count } = await import("drizzle-orm");

// Count total for pagination meta
let countQuery = db
  .select({ total: sql<number>`cast(count(*) as int)` })
  .from(jotformImports);

if (status) {
  countQuery = countQuery.where(
    sql`${jotformImports.status} = ${status}`,
  ) as typeof countQuery;
}

const [countResult] = await countQuery;
const total = countResult?.total ?? 0;
```

Change the return (line 283) from:

```typescript
return { success: true, data };
```

to:

```typescript
return {
  success: true,
  data,
  meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
};
```

- [ ] **Step 2: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/plugins/verification/routes/jotform.ts
git commit -m "feat: add total count and pagination meta to jotform queue endpoint"
```

---

### Task 4: Frontend Hooks — Suggestions, Manual Resolve, Pagination Params

**Files:**

- Modify: `frontend/src/hooks/use-wells.ts`
- Modify: `frontend/src/hooks/use-bol.ts`
- Modify: `frontend/src/lib/query-client.ts`

- [ ] **Step 1: Add query key for suggestions**

In `frontend/src/lib/query-client.ts`, add to the `qk` object after the `dispatchDesk` block (after line 37):

```typescript
  suggestions: {
    all: ["suggestions"] as const,
    forLoad: (loadId: number) => [...qk.suggestions.all, loadId] as const,
  },
```

- [ ] **Step 2: Add useWellSuggestions and useManualResolve hooks**

In `frontend/src/hooks/use-wells.ts`, add these at the end of the file (before the closing):

```typescript
export function useWellSuggestions(loadId: number | null) {
  return useQuery({
    queryKey: qk.suggestions.forLoad(loadId!),
    queryFn: () =>
      api.get<
        Array<{
          wellId: number;
          wellName: string;
          score: number;
          tier: number;
          matchType: string;
        }>
      >(`/dispatch/suggest/${loadId}`),
    enabled: loadId !== null,
    staleTime: 60_000,
  });
}

export function useManualResolve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { loadId: number; wellId: number }) =>
      api.post("/dispatch/validation/resolve", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.validation.all });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
      queryClient.invalidateQueries({ queryKey: qk.readiness.all });
    },
  });
}

export function useCreateWell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string }) =>
      api.post<Well>("/dispatch/wells/", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.wells.all });
    },
  });
}
```

- [ ] **Step 3: Update useBolQueue to accept pagination params**

In `frontend/src/hooks/use-bol.ts`, change `useBolQueue` from:

```typescript
export function useBolQueue() {
  return useQuery({
    queryKey: qk.bol.queue(),
    queryFn: () => api.get<BolQueueItem[]>("/verification/jotform/queue"),
    refetchInterval: 30_000,
  });
}
```

to:

```typescript
export function useBolQueue(opts?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: [...qk.bol.queue(), opts] as const,
    queryFn: () =>
      api.get<{
        data: BolQueueItem[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/verification/jotform/queue${qs}`),
    refetchInterval: 30_000,
  });
}
```

Note: The return type changes from `BolQueueItem[]` to `{ data, meta }` because the backend now wraps the response.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors (may have warnings in pages that use the changed hooks — those get fixed in later tasks)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/use-wells.ts frontend/src/hooks/use-bol.ts frontend/src/lib/query-client.ts
git commit -m "feat: add well suggestion, manual resolve, create well hooks + pagination params"
```

---

### Task 5: WellPicker Component

**Files:**

- Create: `frontend/src/components/WellPicker.tsx`

- [ ] **Step 1: Create the WellPicker component**

```tsx
// frontend/src/components/WellPicker.tsx

import { useState, useRef, useEffect } from "react";
import {
  useWells,
  useWellSuggestions,
  useManualResolve,
  useCreateWell,
  useValidationReject,
} from "../hooks/use-wells";
import { useToast } from "./Toast";
import type { Well } from "../types/api";

interface WellPickerProps {
  loadId: number;
  assignmentId: number | null;
  currentWellId: number | null;
  currentWellName: string;
  onResolved: () => void;
}

export function WellPicker({
  loadId,
  assignmentId,
  currentWellId,
  currentWellName,
  onResolved,
}: WellPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const wellsQuery = useWells();
  const suggestionsQuery = useWellSuggestions(open ? loadId : null);
  const resolveMutation = useManualResolve();
  const rejectMutation = useValidationReject();
  const createWellMutation = useCreateWell();

  const isPending =
    resolveMutation.isPending ||
    rejectMutation.isPending ||
    createWellMutation.isPending;

  // Close on click-away
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const wells: Well[] = Array.isArray(wellsQuery.data) ? wellsQuery.data : [];
  const suggestions = Array.isArray(suggestionsQuery.data)
    ? suggestionsQuery.data
    : [];

  const filteredWells = search
    ? wells.filter(
        (w) =>
          w.name.toLowerCase().includes(search.toLowerCase()) &&
          w.status === "active",
      )
    : wells.filter((w) => w.status === "active");

  const handleSelect = async (wellId: number) => {
    try {
      // If reassigning (has existing assignment), reject first
      if (assignmentId) {
        await rejectMutation.mutateAsync({
          assignmentId,
          reason: "Reassigned via well picker",
        });
      }
      // Then resolve to new well
      await resolveMutation.mutateAsync({ loadId, wellId });
      toast("Well assigned", "success");
      setOpen(false);
      setSearch("");
      onResolved();
    } catch (err) {
      toast(`Assignment failed: ${(err as Error).message}`, "error");
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const well = await createWellMutation.mutateAsync({
        name: newName.trim(),
      });
      setCreating(false);
      setNewName("");
      // Auto-select the new well
      await handleSelect((well as any).id ?? (well as any).data?.id);
    } catch (err) {
      toast(`Create failed: ${(err as Error).message}`, "error");
    }
  };

  const isUnresolved = currentWellId === 0 || currentWellId === null;

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`text-sm font-bold truncate max-w-[140px] cursor-pointer transition-colors ${
          isUnresolved
            ? "text-error hover:text-error/80 underline decoration-dashed"
            : "text-on-surface hover:text-primary-container underline decoration-transparent hover:decoration-primary-container/50"
        }`}
        title={isUnresolved ? "Click to assign well" : "Click to reassign"}
      >
        {currentWellName}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="relative z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
        placeholder="Search wells..."
        className="w-48 bg-surface-container-high border border-primary-container/50 rounded-lg px-3 py-1.5 text-sm text-on-surface font-label focus:outline-none focus:ring-1 focus:ring-primary-container/50"
        disabled={isPending}
      />

      {/* Dropdown */}
      <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-surface-container-lowest border border-on-surface/10 rounded-xl shadow-2xl">
        {/* Suggestions section */}
        {suggestions.length > 0 && (
          <>
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-on-surface/30 border-b border-on-surface/5">
              Suggested
            </div>
            {suggestions.slice(0, 5).map((s) => (
              <button
                key={s.wellId}
                onClick={() => handleSelect(s.wellId)}
                disabled={isPending}
                className="w-full text-left px-3 py-2.5 hover:bg-surface-container-high transition-colors cursor-pointer flex items-center justify-between disabled:opacity-50"
              >
                <span className="text-sm text-on-surface font-label truncate">
                  {s.wellName}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    s.score >= 0.9
                      ? "text-tertiary bg-tertiary/10"
                      : s.score >= 0.7
                        ? "text-primary-container bg-primary-container/10"
                        : "text-on-surface/40 bg-on-surface/5"
                  }`}
                >
                  {Math.round(s.score * 100)}%
                </span>
              </button>
            ))}
          </>
        )}

        {/* All wells section */}
        <div className="px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-on-surface/30 border-b border-on-surface/5">
          {search ? `Results` : "All Wells"} ({filteredWells.length})
        </div>
        {filteredWells.slice(0, 20).map((w) => (
          <button
            key={w.id}
            onClick={() => handleSelect(w.id)}
            disabled={isPending || w.id === currentWellId}
            className={`w-full text-left px-3 py-2 hover:bg-surface-container-high transition-colors cursor-pointer text-sm font-label disabled:opacity-30 ${
              w.id === currentWellId ? "text-on-surface/30" : "text-on-surface"
            }`}
          >
            {w.name}
          </button>
        ))}
        {filteredWells.length > 20 && (
          <div className="px-3 py-2 text-[10px] text-on-surface/30 text-center">
            Type to narrow results...
          </div>
        )}

        {/* Create new well */}
        <div className="border-t border-on-surface/5">
          {creating ? (
            <div className="px-3 py-2 flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Well name..."
                className="flex-1 bg-surface-container-high border border-on-surface/10 rounded px-2 py-1.5 text-xs text-on-surface font-label focus:outline-none focus:border-primary-container/50"
                autoFocus
                disabled={isPending}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isPending}
                className="text-tertiary text-xs font-bold cursor-pointer hover:underline disabled:opacity-50"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              disabled={isPending}
              className="w-full text-left px-3 py-2.5 text-sm text-primary-container font-bold hover:bg-surface-container-high transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Create New Well
            </button>
          )}
        </div>

        {/* Loading indicator */}
        {isPending && (
          <div className="px-3 py-2 text-center">
            <span className="text-[10px] text-on-surface/40 animate-pulse">
              Assigning...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WellPicker.tsx
git commit -m "feat: add WellPicker component — inline well search, suggest, create"
```

---

### Task 6: Validation Page — Integrate WellPicker + Pagination

**Files:**

- Modify: `frontend/src/pages/Validation.tsx`

- [ ] **Step 1: Rewrite Validation.tsx with WellPicker and Pagination**

Replace the entire file content. Key changes from the current version:

- Import `WellPicker` and `Pagination`
- Add per-tier `page`/`pageSize` state
- Fetch tiers with pagination params
- Replace static well name text with `<WellPicker>` in the row
- Tier 3 rows: remove Confirm/Reject, WellPicker is the primary action
- Add `<Pagination>` below each tier section

```tsx
// frontend/src/pages/Validation.tsx

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useValidationSummary,
  useValidationConfirm,
  useValidationReject,
} from "../hooks/use-wells";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import { useToast } from "../components/Toast";
import { WellPicker } from "../components/WellPicker";
import { Pagination } from "../components/Pagination";

interface TierAssignment {
  id: number;
  wellId: number;
  loadId: number;
  status: string;
  autoMapTier: number | null;
  autoMapScore: string | null;
  photoStatus: string | null;
  createdAt: string;
  loadNo: string;
  driverName: string | null;
  destinationName: string | null;
  carrierName: string | null;
  weightTons: string | null;
  ticketNo: string | null;
  bolNo: string | null;
  wellName: string;
}

interface TierResponse {
  data: TierAssignment[];
  meta: {
    tier: number;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const TIER_META: Record<
  number,
  { label: string; description: string; icon: string; color: string }
> = {
  1: {
    label: "Tier 1",
    description: "High Confidence -- Job ID Match",
    icon: "verified",
    color: "tertiary",
  },
  2: {
    label: "Tier 2",
    description: "Medium Confidence -- Fuzzy Match",
    icon: "help",
    color: "primary-container",
  },
  3: {
    label: "Tier 3",
    description: "Unresolved -- Manual Required",
    icon: "warning",
    color: "error",
  },
};

function ConfidenceBadge({ score }: { score: string | null }) {
  if (score == null) return null;
  const pct = Math.round(Number(score) * 100);
  const color =
    pct >= 90
      ? "text-tertiary bg-tertiary/10"
      : pct >= 70
        ? "text-primary-container bg-primary-container/10"
        : "text-error bg-error/10";
  return (
    <span
      className={`font-label text-xs font-bold px-2 py-0.5 rounded ${color}`}
    >
      {pct}%
    </span>
  );
}

export function Validation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedTiers, setExpandedTiers] = useState<Set<number>>(
    new Set([1, 2, 3]),
  );
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Per-tier pagination state
  const [tierPages, setTierPages] = useState<Record<number, number>>({
    1: 1,
    2: 1,
    3: 1,
  });
  const [tierPageSizes, setTierPageSizes] = useState<Record<number, number>>({
    1: 50,
    2: 50,
    3: 50,
  });

  const summaryQuery = useValidationSummary();
  const confirmMutation = useValidationConfirm();
  const rejectMutation = useValidationReject();

  const tier1Query = useQuery({
    queryKey: [...qk.validation.tier(1), tierPages[1], tierPageSizes[1]],
    queryFn: () =>
      api.get<TierResponse>(
        `/dispatch/validation/tier/1?page=${tierPages[1]}&limit=${tierPageSizes[1]}`,
      ),
  });
  const tier2Query = useQuery({
    queryKey: [...qk.validation.tier(2), tierPages[2], tierPageSizes[2]],
    queryFn: () =>
      api.get<TierResponse>(
        `/dispatch/validation/tier/2?page=${tierPages[2]}&limit=${tierPageSizes[2]}`,
      ),
  });
  const tier3Query = useQuery({
    queryKey: [...qk.validation.tier(3), tierPages[3], tierPageSizes[3]],
    queryFn: () =>
      api.get<TierResponse>(
        `/dispatch/validation/tier/3?page=${tierPages[3]}&limit=${tierPageSizes[3]}`,
      ),
  });

  const tierQueries: Record<number, typeof tier1Query> = {
    1: tier1Query,
    2: tier2Query,
    3: tier3Query,
  };

  const summary = summaryQuery.data as Record<string, unknown> | undefined;
  const tierCounts: Record<number, number> = {
    1: Number(summary?.tier1 ?? 0),
    2: Number(summary?.tier2 ?? 0),
    3: Number(summary?.tier3 ?? 0),
  };

  const toggleTier = (tier: number) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.validation.all });
    queryClient.invalidateQueries({ queryKey: qk.assignments.all });
    queryClient.invalidateQueries({ queryKey: qk.wells.all });
    queryClient.invalidateQueries({ queryKey: qk.readiness.all });
  }, [queryClient]);

  const handleConfirm = (assignmentId: number) => {
    confirmMutation.mutate(
      { assignmentId },
      {
        onSuccess: () => {
          toast("Assignment confirmed", "success");
          invalidateAll();
        },
        onError: (err) =>
          toast(`Confirm failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleReject = (assignmentId: number) => {
    rejectMutation.mutate(
      { assignmentId, reason: rejectReason || undefined },
      {
        onSuccess: () => {
          toast("Assignment rejected", "success");
          setRejectingId(null);
          setRejectReason("");
          invalidateAll();
        },
        onError: (err) =>
          toast(`Reject failed: ${(err as Error).message}`, "error"),
      },
    );
  };

  const handleBulkApproveTier1 = () => {
    const tierData = tier1Query.data as unknown as TierResponse | undefined;
    const assignments =
      tierData?.data ?? (Array.isArray(tier1Query.data) ? tier1Query.data : []);
    if (assignments.length === 0) return;

    const ids = assignments.map((a: TierAssignment) => a.id);
    let completed = 0;

    ids.forEach((id: number) => {
      confirmMutation.mutate(
        { assignmentId: id },
        {
          onSuccess: () => {
            completed++;
            if (completed === ids.length) {
              toast(`${ids.length} Tier 1 assignments approved`, "success");
              invalidateAll();
            }
          },
          onError: (err) =>
            toast(
              `Failed on assignment ${id}: ${(err as Error).message}`,
              "error",
            ),
        },
      );
    });
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface uppercase">
          Validation
        </h1>
        <p className="text-on-surface/40 font-label text-xs uppercase tracking-widest mt-1">
          Tier-Based Review // Human Confirms
        </p>
      </div>

      {/* Quick Action: Bulk Approve Tier 1 */}
      {tierCounts[1] > 0 && !summaryQuery.isLoading && (
        <div className="bg-surface-container-low rounded-xl p-6 border border-tertiary/20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-tertiary/10 p-3 rounded-lg">
              <span className="material-symbols-outlined text-tertiary text-2xl">
                verified
              </span>
            </div>
            <div>
              <p className="text-on-surface font-bold text-lg">
                {tierCounts[1]} high-confidence matches ready
              </p>
              <p className="text-on-surface/40 text-xs font-label">
                Job ID matched -- bulk approve to move to dispatch
              </p>
            </div>
          </div>
          <button
            onClick={handleBulkApproveTier1}
            disabled={confirmMutation.isPending}
            className="bg-tertiary/15 text-tertiary px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-tertiary/25 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">done_all</span>
            Approve All Tier 1
          </button>
        </div>
      )}

      {/* Tier Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((tier) => {
          const meta = TIER_META[tier];
          const count = tierCounts[tier];
          return (
            <button
              key={tier}
              onClick={() => toggleTier(tier)}
              className={`bg-surface-container-low rounded-xl p-6 border-l-4 border-${meta.color} text-left transition-all hover:bg-surface-container-high cursor-pointer group`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-${meta.color}`}
                  >
                    {meta.icon}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                    {meta.label}
                  </span>
                </div>
                <span
                  className={`material-symbols-outlined text-sm text-on-surface/30 transition-transform ${expandedTiers.has(tier) ? "rotate-180" : ""}`}
                >
                  expand_more
                </span>
              </div>
              <div
                className={`font-label text-3xl font-bold text-${meta.color}`}
              >
                {summaryQuery.isLoading ? "..." : count}
              </div>
              <p className="text-[10px] text-on-surface/40 uppercase tracking-wider mt-1">
                {meta.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Total */}
      <div className="flex items-center gap-4 px-2">
        <span className="text-xs text-on-surface/30 uppercase tracking-widest font-bold">
          Total Pending
        </span>
        <span className="font-label text-lg font-bold text-on-surface">
          {summaryQuery.isLoading
            ? "..."
            : tierCounts[1] + tierCounts[2] + tierCounts[3]}
        </span>
      </div>

      {/* Tier Sections */}
      {[1, 2, 3].map((tier) => {
        if (!expandedTiers.has(tier)) return null;

        const meta = TIER_META[tier];
        const query = tierQueries[tier];
        const rawData = query.data as unknown;
        // Handle both old (array) and new (paginated) response shapes
        const tierResponse = rawData as
          | TierResponse
          | TierAssignment[]
          | undefined;
        const assignments: TierAssignment[] = Array.isArray(tierResponse)
          ? tierResponse
          : ((tierResponse as TierResponse)?.data ?? []);
        const tierTotal = Array.isArray(tierResponse)
          ? tierResponse.length
          : ((tierResponse as TierResponse)?.meta?.total ?? assignments.length);

        const page = tierPages[tier];
        const pageSize = tierPageSizes[tier];

        return (
          <section key={tier} className="space-y-3">
            {/* Tier Section Header */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full bg-${meta.color}`} />
                <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40">
                  {meta.label}{" "}
                  <span className={`text-${meta.color}`}>
                    {meta.description}
                  </span>
                </h3>
              </div>
              {tier === 1 && assignments.length > 0 && (
                <button
                  onClick={handleBulkApproveTier1}
                  disabled={confirmMutation.isPending}
                  className="bg-tertiary/10 text-tertiary px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-tertiary/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">
                    done_all
                  </span>
                  Approve All Tier 1 ({assignments.length})
                </button>
              )}
            </div>

            {/* Loading */}
            {query.isLoading && (
              <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-container-low p-5 animate-pulse flex items-center gap-6"
                  >
                    <div className="h-4 w-24 bg-on-surface/10 rounded" />
                    <div className="h-4 w-32 bg-on-surface/5 rounded" />
                    <div className="h-4 w-48 bg-on-surface/5 rounded" />
                    <div className="flex-1" />
                    <div className="h-8 w-20 bg-on-surface/5 rounded-lg" />
                    <div className="h-8 w-20 bg-on-surface/5 rounded-lg" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!query.isLoading && assignments.length === 0 && (
              <div className="bg-surface-container-low rounded-xl p-8 text-center border border-on-surface/5">
                <span className="material-symbols-outlined text-3xl text-on-surface/15 mb-2">
                  inbox
                </span>
                <p className="text-on-surface/30 font-label text-sm">
                  No {meta.label.toLowerCase()} assignments pending
                </p>
              </div>
            )}

            {/* Rows */}
            {assignments.length > 0 && (
              <div className="space-y-[1px] bg-on-surface/5 rounded-xl overflow-hidden border border-on-surface/5">
                {/* Table Header */}
                <div className="bg-surface-container-lowest/50 px-6 py-3 flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-on-surface/30">
                  <div className="w-6" /> {/* expand icon */}
                  <div className="w-28">Load #</div>
                  <div className="w-36">Driver</div>
                  <div className="flex-1">Destination &rarr; Well</div>
                  <div className="w-20 text-center">Score</div>
                  <div className="w-44 text-right">Actions</div>
                </div>

                {assignments.map((a) => (
                  <div key={`${tier}-${a.id}`}>
                    {/* Summary Row */}
                    <div
                      onClick={() =>
                        setExpandedId(expandedId === a.id ? null : a.id)
                      }
                      className="bg-surface-container-low hover:bg-surface-container-high transition-all px-6 py-4 flex items-center gap-6 cursor-pointer"
                    >
                      <span
                        className={`material-symbols-outlined text-sm text-on-surface/30 transition-transform ${expandedId === a.id ? "rotate-90" : ""}`}
                      >
                        chevron_right
                      </span>

                      <div className="w-24">
                        <span className="font-label text-sm font-bold text-on-surface">
                          {a.loadNo || `#${a.loadId}`}
                        </span>
                      </div>

                      <div className="w-36">
                        <span className="text-sm text-on-surface/80 truncate block">
                          {a.driverName ?? "--"}
                        </span>
                      </div>

                      {/* Destination -> Well (clickable WellPicker) */}
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="font-label text-xs text-on-surface/50 truncate max-w-[140px]">
                          {a.destinationName ?? "Unknown"}
                        </span>
                        <span className="material-symbols-outlined text-xs text-on-surface/20">
                          arrow_forward
                        </span>
                        <WellPicker
                          loadId={a.loadId}
                          assignmentId={tier === 3 ? null : a.id}
                          currentWellId={a.wellId === 0 ? null : a.wellId}
                          currentWellName={a.wellName}
                          onResolved={invalidateAll}
                        />
                      </div>

                      <div className="w-20 text-center">
                        <ConfidenceBadge score={a.autoMapScore} />
                      </div>

                      {/* Actions — Tier 1/2 get confirm/reject, Tier 3 gets nothing (WellPicker is the action) */}
                      <div
                        className="w-44 flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tier !== 3 && (
                          <>
                            {rejectingId === a.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={rejectReason}
                                  onChange={(e) =>
                                    setRejectReason(e.target.value)
                                  }
                                  placeholder="Reason (optional)"
                                  className="w-28 bg-surface-container-high border border-on-surface/10 rounded px-2 py-1.5 text-xs text-on-surface font-label focus:outline-none focus:border-error/50"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleReject(a.id);
                                    if (e.key === "Escape") {
                                      setRejectingId(null);
                                      setRejectReason("");
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleReject(a.id)}
                                  disabled={rejectMutation.isPending}
                                  className="text-error text-xs font-bold cursor-pointer hover:underline"
                                >
                                  Send
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason("");
                                  }}
                                  className="text-on-surface/30 text-xs cursor-pointer hover:text-on-surface/60"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleConfirm(a.id)}
                                  disabled={confirmMutation.isPending}
                                  className="bg-tertiary/10 text-tertiary px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-tertiary/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    check
                                  </span>
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setRejectingId(a.id)}
                                  disabled={rejectMutation.isPending}
                                  className="bg-error/10 text-error px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-error/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    close
                                  </span>
                                  Reject
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {expandedId === a.id && (
                      <div className="bg-surface-container-lowest px-6 py-5 border-t border-on-surface/5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: "Load #", value: a.loadNo },
                            { label: "Driver", value: a.driverName },
                            { label: "Carrier", value: a.carrierName },
                            { label: "Destination", value: a.destinationName },
                            { label: "Well", value: a.wellName },
                            { label: "Weight (tons)", value: a.weightTons },
                            { label: "Ticket #", value: a.ticketNo },
                            { label: "BOL #", value: a.bolNo },
                            {
                              label: "Tier",
                              value: a.autoMapTier
                                ? `Tier ${a.autoMapTier}`
                                : "--",
                            },
                            {
                              label: "Score",
                              value: a.autoMapScore
                                ? `${Math.round(Number(a.autoMapScore) * 100)}%`
                                : "--",
                            },
                            {
                              label: "Photo Status",
                              value: a.photoStatus ?? "missing",
                            },
                            {
                              label: "ID",
                              value:
                                tier === 3
                                  ? `Load #${a.id}`
                                  : `Assignment #${a.id}`,
                            },
                          ].map((field) => (
                            <div key={field.label} className="space-y-1">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface/30">
                                {field.label}
                              </span>
                              <p className="text-sm text-on-surface font-label">
                                {field.value || (
                                  <span className="text-on-surface/20">--</span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {tierTotal > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={tierTotal}
                onPageChange={(p) =>
                  setTierPages((prev) => ({ ...prev, [tier]: p }))
                }
                onPageSizeChange={(s) => {
                  setTierPageSizes((prev) => ({ ...prev, [tier]: s }));
                  setTierPages((prev) => ({ ...prev, [tier]: 1 }));
                }}
                loading={query.isLoading}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Validation.tsx
git commit -m "feat: validation page — inline WellPicker for all tiers + pagination"
```

---

### Task 7: BOL Queue — Add Pagination

**Files:**

- Modify: `frontend/src/pages/BolQueue.tsx`

- [ ] **Step 1: Add pagination state and Pagination component**

At the top of the `BolQueue` function component, add state:

```typescript
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(50);
```

Change the `useBolQueue` call to pass pagination:

```typescript
const bolQuery = useBolQueue({ page, limit: pageSize });
```

The data shape from the hook now returns `{ data, meta }` instead of a flat array. Update how `submissions` is extracted:

```typescript
const response = bolQuery.data as any;
const submissions = response?.data ?? (Array.isArray(response) ? response : []);
const total = response?.meta?.total ?? submissions.length;
```

Add the `Pagination` import and render it after the submissions list:

```tsx
import { Pagination } from "../components/Pagination";
```

After the submissions list closing `</div>`, before the photo modal:

```tsx
{
  total > 0 && (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={setPage}
      onPageSizeChange={(s) => {
        setPageSize(s);
        setPage(1);
      }}
      loading={bolQuery.isLoading}
    />
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/BolQueue.tsx
git commit -m "feat: BOL Queue pagination with page size selector"
```

---

### Task 8: Dispatch Desk — Add Pagination

**Files:**

- Modify: `frontend/src/pages/DispatchDesk.tsx`

- [ ] **Step 1: Add pagination state and pass to hook**

At the top of the `DispatchDesk` function, add state:

```typescript
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(50);
```

Update the `useDispatchDeskLoads` call to include pagination:

Change from:

```typescript
const deskQuery = useDispatchDeskLoads(
  selectedWellId ? { wellId: Number(selectedWellId) } : undefined,
);
```

to:

```typescript
const deskQuery = useDispatchDeskLoads(
  selectedWellId
    ? { wellId: Number(selectedWellId), page, limit: pageSize }
    : undefined,
);
```

Update `useDispatchDeskLoads` in `use-wells.ts` to pass `page` and `limit`:

In `frontend/src/hooks/use-wells.ts`, change the `useDispatchDeskLoads` function to also accept `page` and `limit`:

```typescript
export function useDispatchDeskLoads(filters?: {
  wellId?: number;
  photoStatus?: string;
  date?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.wellId) params.set("wellId", String(filters.wellId));
  if (filters?.photoStatus) params.set("photoStatus", filters.photoStatus);
  if (filters?.date) params.set("date", filters.date);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: qk.dispatchDesk.loads(filters),
    queryFn: () =>
      api.get<Paginated<DispatchDeskLoad>>(`/dispatch/dispatch-desk/${qs}`),
    refetchInterval: 30_000,
  });
}
```

Add pagination import and render after the load lists in DispatchDesk.tsx:

```tsx
import { Pagination } from "../components/Pagination";
```

Before the completion summary section, add:

```tsx
{
  selectedWellId && allLoads.length > 0 && (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={deskQuery.data?.total ?? allLoads.length}
      onPageChange={setPage}
      onPageSizeChange={(s) => {
        setPageSize(s);
        setPage(1);
      }}
      loading={deskQuery.isLoading}
    />
  );
}
```

Reset page when well changes — add to `handleSelectWell`:

```typescript
const handleSelectWell = (wellId: string) => {
  setSearchParams(wellId ? { wellId } : {});
  setEnteredIds(new Set());
  setPage(1);
};
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DispatchDesk.tsx frontend/src/hooks/use-wells.ts
git commit -m "feat: Dispatch Desk pagination with page size selector"
```

---

### Task 9: Build, Deploy, Verify

**Files:** None (deploy task)

- [ ] **Step 1: Build backend to verify no compilation errors**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: `✓ built in <N>s`, no errors

- [ ] **Step 3: Deploy frontend to Vercel**

```bash
cd frontend && vercel --yes --prod -e VITE_API_URL=https://backend-production-7960.up.railway.app --scope i-wuntu
```

Expected: Build succeeds, deployed to `app.esexpressllc.com`

- [ ] **Step 4: Push backend changes to trigger Railway redeploy**

```bash
git push origin main
```

- [ ] **Step 5: Verify on production**

1. Open `https://app.esexpressllc.com/validation`
2. Verify pagination controls appear below each tier
3. Click a well name in Tier 1/2 — WellPicker should open with suggestions
4. Click "-- Unresolved --" in Tier 3 — WellPicker should open
5. Verify BOL Queue has pagination
6. Verify Dispatch Desk has pagination

- [ ] **Step 6: Final commit with any fixes**

```bash
git push origin main
```
