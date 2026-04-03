# Jess Meeting UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure ES Express v2 frontend to merge validation into dispatch desk, rename Exception Feed to "Today's Objectives", add date filtering/validation status indicators, and apply cream/purple palette polish.

**Architecture:** Component-level refactor of 5 existing files. No new routes, no backend changes. Existing hooks (`useValidationConfirm`, `useValidationSummary`, `useDispatchDeskLoads`, `usePresence`) already provide all data needed. New UI components (PhotoModal, ValidationBadge) are extracted as small focused files. The cream/purple color palette is already in `tailwind.css` — all component classes use semantic tokens, so no per-component color changes are needed.

**Tech Stack:** React 18, React Router 6, TanStack Query, Tailwind CSS v4, Material Symbols

---

### Task 1: Sidebar Navigation Restructure

**Files:**

- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Update nav order and rename Exception Feed**

Replace the `<nav>` section (lines 42-85) in `frontend/src/components/Sidebar.tsx`:

```tsx
<nav className="flex-1 px-3 space-y-1">
  <Link to="/" className={navClass("/")}>
    <span className="material-symbols-outlined">home</span>
    <span className="text-sm font-medium">Today's Objectives</span>
  </Link>
  <Link to="/dispatch-desk" className={navClass("/dispatch-desk")}>
    <span className="material-symbols-outlined">local_shipping</span>
    <span className="text-sm font-medium">Dispatch Desk</span>
  </Link>
  <Link to="/bol" className={navClass("/bol")}>
    <span className="material-symbols-outlined">description</span>
    <span className="text-sm font-medium">BOL Queue</span>
  </Link>
  <div className="pt-5 pb-1.5 px-4">
    <span className="text-[10px] uppercase tracking-[0.15em] text-on-surface/25 font-bold font-label">
      Admin
    </span>
  </div>
  <Link to="/validation" className={navClass("/validation")}>
    <span className="material-symbols-outlined">fact_check</span>
    <span className="text-sm font-medium">Validation</span>
  </Link>
  <Link to="/admin/wells" className={navClass("/admin/wells")}>
    <span className="material-symbols-outlined">oil_barrel</span>
    <span className="text-sm font-medium">Wells</span>
  </Link>
  <Link to="/admin/companies" className={navClass("/admin/companies")}>
    <span className="material-symbols-outlined">business</span>
    <span className="text-sm font-medium">Companies</span>
  </Link>
  <Link to="/admin/users" className={navClass("/admin/users")}>
    <span className="material-symbols-outlined">group</span>
    <span className="text-sm font-medium">Users</span>
  </Link>
  <div className="pt-5 pb-1.5 px-4">
    <span className="text-[10px] uppercase tracking-[0.15em] text-on-surface/25 font-bold font-label">
      Operations
    </span>
  </div>
  <Link to="/finance" className={navClass("/finance")}>
    <span className="material-symbols-outlined">payments</span>
    <span className="text-sm font-medium">Finance</span>
  </Link>
</nav>
```

- [ ] **Step 2: Verify sidebar retains logout, settings, and presence**

Confirm the footer section (lines 86-133) is unchanged — it should still contain:

- Live Presence section with green dots
- Settings link
- Log Out button

No changes needed to the footer — just verify it compiles.

- [ ] **Step 3: Run dev server and verify sidebar renders**

Run: `npx vite --host 0.0.0.0 --port 5180` (already running)
Navigate to `http://localhost:5180/`
Expected: Sidebar shows "Today's Objectives" as first item, Dispatch Desk second, BOL Queue third, Validation under Admin section. Logout and presence still visible at bottom.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "refactor: restructure sidebar nav — rename Exception Feed, demote Validation to Admin"
```

---

### Task 2: Toast Slide-In Animation + Subtle Depth Utilities

**Files:**

- Modify: `frontend/tailwind.css`

- [ ] **Step 1: Add slide-in keyframe and card-hover utilities**

Add before the `@media (prefers-reduced-motion)` block at the end of `frontend/tailwind.css`:

```css
/* Toast slide-in animation */
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.3s ease-out;
}

/* Subtle card hover depth */
.hover-lift {
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.hover-lift:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 2: Apply slide-in to Toast component**

In `frontend/src/components/Toast.tsx`, update the toast wrapper div (line 61) to add the animation class:

Change:

```tsx
className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg shadow-black/20 cursor-pointer transition-all hover:scale-[1.02] ${variantStyles[msg.variant]}`}
```

To:

```tsx
className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg shadow-black/10 cursor-pointer transition-all hover:scale-[1.02] animate-slide-in-right ${variantStyles[msg.variant]}`}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tailwind.css frontend/src/components/Toast.tsx
git commit -m "style: add toast slide-in animation and hover-lift depth utility"
```

---

### Task 3: Exception Feed → Today's Objectives + Validation Progress

**Files:**

- Modify: `frontend/src/pages/ExceptionFeed.tsx`

- [ ] **Step 1: Rename page header**

In `frontend/src/pages/ExceptionFeed.tsx`, change the page header (lines 77-88):

Replace:

```tsx
<h1 className="text-2xl font-headline font-black tracking-tight text-on-surface uppercase">
  Exception Feed
</h1>
```

With:

```tsx
<h1 className="text-2xl font-headline font-black tracking-tight text-on-surface uppercase">
  Today's Objectives
</h1>
```

- [ ] **Step 2: Add validation progress column to well rows**

In the well data mapping (lines 34-45), add a `validated` field. Replace the wells mapping:

```tsx
const wells = (rawWells as Array<Record<string, unknown>>)
  .map((w) => ({
    id: String(w.id ?? ""),
    name: String(w.name ?? ""),
    totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
    ready: Number(w.ready ?? 0),
    review: Number(w.review ?? 0),
    assigned: Number(w.assigned ?? 0),
    missing: Number(w.missing ?? 0),
    validated: Number((w as any).validated ?? 0),
  }))
  .filter((w) => w.totalLoads > 0)
  .sort((a, b) => b.review - a.review || b.totalLoads - a.totalLoads);
```

- [ ] **Step 3: Add Validated column to the well row grid**

In the well row's 3-column grid (lines 239-305), change from `grid-cols-3` to `grid-cols-4` and add a Validated column after the Ready column. Replace the entire grid div:

```tsx
<div className="flex-1 grid grid-cols-4 gap-6">
  <div className="space-y-1">
    <span className="text-[10px] uppercase font-bold text-on-surface/40 tracking-widest">
      Ready
    </span>
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
        <div
          className="h-full bg-tertiary"
          style={{ width: pct(well.ready, well.totalLoads) }}
        />
      </div>
      <span className="font-label text-sm font-bold">{well.ready}</span>
    </div>
  </div>
  <div className="space-y-1">
    <span className="text-[10px] uppercase font-bold text-tertiary/70 tracking-widest">
      Validated
    </span>
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
        <div
          className="h-full bg-tertiary/60"
          style={{ width: pct(well.validated, well.totalLoads) }}
        />
      </div>
      <span className="font-label text-sm font-bold text-tertiary">
        {well.validated}/{well.totalLoads}
      </span>
    </div>
  </div>
  <div className={`space-y-1 ${well.review === 0 ? "opacity-20" : ""}`}>
    <span
      className={`text-[10px] uppercase font-bold tracking-widest ${well.review > 0 ? "text-on-surface/40" : ""}`}
    >
      Review
    </span>
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-container"
          style={{ width: pct(well.review, well.totalLoads) }}
        />
      </div>
      <span
        className={`font-label text-sm font-bold ${well.review > 0 ? "text-primary-container" : ""}`}
      >
        {well.review}
      </span>
    </div>
  </div>
  <div className={`space-y-1 ${well.missing === 0 ? "opacity-20" : ""}`}>
    <span
      className={`text-[10px] uppercase font-bold tracking-widest ${well.missing > 0 ? "text-error" : ""}`}
    >
      Missing Photos
    </span>
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-surface-container-lowest rounded-full overflow-hidden">
        <div
          className="h-full bg-error"
          style={{ width: pct(well.missing, well.totalLoads) }}
        />
      </div>
      <span
        className={`font-label text-sm font-bold ${well.missing > 0 ? "text-error" : ""}`}
      >
        {well.missing}
      </span>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Verify page renders**

Navigate to `http://localhost:5180/`
Expected: Page title says "Today's Objectives", wells show 4-column grid with Ready/Validated/Review/Missing. Validated column shows fraction like "0/76".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ExceptionFeed.tsx
git commit -m "feat: rename Exception Feed to Today's Objectives, add validation progress per well"
```

---

### Task 4: PhotoModal Component

**Files:**

- Create: `frontend/src/components/PhotoModal.tsx`

- [ ] **Step 1: Create the PhotoModal component**

Create `frontend/src/components/PhotoModal.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Button } from "./Button";

interface PhotoModalProps {
  photoUrls: string[];
  loadNo: string;
  wellName: string;
  bolNo: string | null;
  driverName: string | null;
  truckNo: string | null;
  carrierName: string | null;
  weightTons: string | null;
  ticketNo: string | null;
  autoMapScore: string | null;
  onClose: () => void;
  onValidate?: () => void;
  onFlag?: () => void;
  showValidateButton?: boolean;
}

function InfoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 block">
        {label}
      </span>
      <p className="text-sm text-on-surface font-label mt-0.5">
        {value || <span className="text-on-surface/20">--</span>}
      </p>
    </div>
  );
}

export function PhotoModal({
  photoUrls,
  loadNo,
  wellName,
  bolNo,
  driverName,
  truckNo,
  carrierName,
  weightTons,
  ticketNo,
  autoMapScore,
  onClose,
  onValidate,
  onFlag,
  showValidateButton = true,
}: PhotoModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0)
        setCurrentIndex(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < photoUrls.length - 1)
        setCurrentIndex(currentIndex + 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, currentIndex, photoUrls.length]);

  const matchPct = autoMapScore ? Math.round(Number(autoMapScore) * 100) : null;
  const matchColor =
    matchPct && matchPct >= 90
      ? "text-tertiary bg-tertiary/10"
      : matchPct && matchPct >= 70
        ? "text-primary-container bg-primary-container/10"
        : "text-error bg-error/10";

  const fullUrl = (url: string) =>
    url.startsWith("/") ? `${import.meta.env.VITE_API_URL || ""}${url}` : url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container rounded-xl w-[70vw] max-w-5xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-container-high/60">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary-container">
              description
            </span>
            <div>
              <span className="font-label font-bold text-on-surface">
                BOL #{bolNo || "--"}
              </span>
              <span className="text-xs text-on-surface/40 ml-4">
                Load {loadNo} &middot; {wellName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface/40 hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Photo */}
          <div className="flex-1 bg-surface-container-lowest flex items-center justify-center p-4">
            {photoUrls.length > 0 ? (
              <img
                src={fullUrl(photoUrls[currentIndex])}
                alt={`Photo ${currentIndex + 1}`}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            ) : (
              <div className="text-center text-on-surface/20">
                <span className="material-symbols-outlined text-6xl block mb-2">
                  receipt_long
                </span>
                <p className="font-label text-sm">No photos available</p>
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="w-64 bg-surface-container-low p-5 space-y-4 overflow-y-auto">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
              Load Details
            </h4>
            <div className="space-y-3">
              <InfoField label="Driver" value={driverName} />
              <InfoField label="Truck #" value={truckNo} />
              <InfoField label="Carrier" value={carrierName} />
              <InfoField label="Weight (tons)" value={weightTons} />
              <InfoField label="BOL #" value={bolNo} />
              <InfoField label="Ticket #" value={ticketNo} />
              {matchPct !== null && (
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 block">
                    Match
                  </span>
                  <span
                    className={`font-label text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${matchColor}`}
                  >
                    {matchPct}% Match
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 bg-surface-container-high/60">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              icon="arrow_back"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
            >
              Previous
            </Button>
            <span className="font-label text-xs text-on-surface/40">
              {photoUrls.length > 0
                ? `${currentIndex + 1} of ${photoUrls.length}`
                : "No photos"}
            </span>
            <Button
              variant="ghost"
              icon="arrow_forward"
              disabled={currentIndex >= photoUrls.length - 1}
              onClick={() => setCurrentIndex(currentIndex + 1)}
            >
              Next
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {onFlag && (
              <button
                onClick={onFlag}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-error/10 text-error hover:bg-error/20 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">flag</span>
                Flag Issue
              </button>
            )}
            {showValidateButton && onValidate && (
              <button
                onClick={onValidate}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">
                  verified
                </span>
                Validate This Load
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/PhotoModal.tsx
git commit -m "feat: add PhotoModal component for in-window BOL photo viewing"
```

---

### Task 5: Dispatch Desk — Command Bar + Filter Tabs + Validation

**Files:**

- Modify: `frontend/src/pages/DispatchDesk.tsx`

This is the largest task. It adds the command bar, filter tabs, date filter, validation status badges, bulk validate, and integrates the PhotoModal.

- [ ] **Step 1: Add new imports and state**

At the top of `frontend/src/pages/DispatchDesk.tsx`, update imports and add new state. Replace the imports (lines 1-14) with:

```tsx
import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  useWells,
  useDispatchDeskLoads,
  useBulkApprove,
  useValidationConfirm,
  useValidationSummary,
} from "../hooks/use-wells";
import { useMarkEntered, useAdvanceToReady } from "../hooks/use-dispatch-desk";
import { usePresence, useHeartbeat } from "../hooks/use-presence";
import { DispatchCard } from "../components/DispatchCard";
import { PhotoModal } from "../components/PhotoModal";
import { Pagination } from "../components/Pagination";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../lib/query-client";
import type { Well } from "../types/api";
```

- [ ] **Step 2: Add new state variables inside the DispatchDesk component**

After the existing state declarations (after line 24), add:

```tsx
const [activeFilter, setActiveFilter] = useState<string>("all");
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
const [photoModalLoad, setPhotoModalLoad] = useState<any | null>(null);
const [dateFilter, setDateFilter] = useState("");

const queryClient = useQueryClient();
const confirmMutation = useValidationConfirm();
```

- [ ] **Step 3: Add filter logic and validation helpers**

After the `activeLoads` variable (around line 69), add:

```tsx
// Filter loads by active tab
const filteredLoads = (() => {
  switch (activeFilter) {
    case "pending":
      return allLoads.filter((l) => l.assignmentStatus === "pending");
    case "assigned":
      return allLoads.filter((l) => l.assignmentStatus === "assigned");
    case "ready":
      return allLoads.filter((l) => l.assignmentStatus === "dispatch_ready");
    case "validated":
      return allLoads.filter(
        (l) =>
          l.assignmentStatus === "dispatched" ||
          l.assignmentStatus === "delivered",
      );
    default:
      return allLoads;
  }
})();

// Filter counts for tabs
const filterCounts = {
  all: allLoads.length,
  pending: allLoads.filter((l) => l.assignmentStatus === "pending").length,
  assigned: allLoads.filter((l) => l.assignmentStatus === "assigned").length,
  ready: allLoads.filter((l) => l.assignmentStatus === "dispatch_ready").length,
  validated: allLoads.filter(
    (l) =>
      l.assignmentStatus === "dispatched" || l.assignmentStatus === "delivered",
  ).length,
};

// Validation status for a load
const getValidationStatus = (
  load: any,
): "validated" | "pending" | "missing" => {
  if (
    load.assignmentStatus === "dispatched" ||
    load.assignmentStatus === "delivered"
  )
    return "validated";
  if (!load.ticketNo) return "missing";
  return "pending";
};

// Toggle checkbox
const toggleSelect = (id: number) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

// Bulk validate selected
const handleBulkValidate = () => {
  const ids = Array.from(selectedIds);
  let completed = 0;
  ids.forEach((id) => {
    confirmMutation.mutate(
      { assignmentId: id },
      {
        onSuccess: () => {
          completed++;
          if (completed === ids.length) {
            toast(`${ids.length} loads validated`, "success");
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: qk.validation.all });
            queryClient.invalidateQueries({ queryKey: qk.assignments.all });
            queryClient.invalidateQueries({ queryKey: qk.wells.all });
          }
        },
        onError: (err) =>
          toast(`Validate failed: ${(err as Error).message}`, "error"),
      },
    );
  });
};

// Single validate
const handleValidateSingle = (assignmentId: number) => {
  confirmMutation.mutate(
    { assignmentId },
    {
      onSuccess: () => {
        toast("Load validated", "success");
        queryClient.invalidateQueries({ queryKey: qk.validation.all });
        queryClient.invalidateQueries({ queryKey: qk.assignments.all });
        queryClient.invalidateQueries({ queryKey: qk.wells.all });
      },
      onError: (err) =>
        toast(`Validate failed: ${(err as Error).message}`, "error"),
    },
  );
};
```

- [ ] **Step 4: Replace the command bar section**

Replace the well selector section (the `bg-surface-container-low rounded-xl p-6 space-y-4` div, lines 186-275) with the new command bar. This is the full replacement:

```tsx
{
  /* Command Bar */
}
<div className="bg-surface-container-low rounded-xl p-5 space-y-4">
  <div className="flex flex-wrap items-end gap-6">
    <div className="flex-1 min-w-[200px]">
      <label className="block text-[10px] font-label font-bold uppercase tracking-widest text-on-surface/30 mb-2">
        Select Well
      </label>
      <select
        value={selectedWellId}
        onChange={(e) => handleSelectWell(e.target.value)}
        className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 text-sm text-on-surface font-headline focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30 appearance-none cursor-pointer"
      >
        <option value="">Choose a well...</option>
        {wells.map((w) => (
          <option key={w.id} value={String(w.id)}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
    <div className="w-48">
      <label className="block text-[10px] font-label font-bold uppercase tracking-widest text-on-surface/30 mb-2">
        PCS Starting #
      </label>
      <input
        type="number"
        value={pcsStart}
        onChange={(e) => setPcsStart(e.target.value)}
        placeholder="e.g. 229040"
        className="w-full bg-surface-container-high border border-on-surface/10 rounded-lg px-4 py-3 text-sm text-on-surface font-label focus:outline-none focus:border-primary-container/50 focus:ring-1 focus:ring-primary-container/30"
      />
    </div>
  </div>

  {selectedWellId && (
    <>
      {/* Well name + presence + actions */}
      <div className="flex items-center justify-between pt-3 border-t border-on-surface/5">
        <div className="flex items-center gap-4">
          <span className="font-headline font-bold text-on-surface text-lg">
            {wellName}
          </span>
          {usersOnThisWell.length > 0 && (
            <div className="flex items-center gap-2 bg-surface-container-high/50 px-3 py-1 rounded-full">
              {usersOnThisWell.map((u: any) => (
                <div key={u.userId} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(13,150,104,0.5)]" />
                  <span className="text-xs text-on-surface/70 font-label">
                    {u.userName?.split(" ")[0] || "User"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-container-high rounded-lg px-3 py-2">
            <span className="material-symbols-outlined text-on-surface/40 text-sm">
              calendar_today
            </span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-xs font-label text-on-surface/70 focus:outline-none cursor-pointer"
            />
          </div>
          <Button
            variant="secondary"
            icon="folder_zip"
            onClick={handleDownloadZip}
            disabled={activeLoads.length === 0}
          >
            Download Photos
          </Button>
          <Button
            variant="primary"
            icon="done_all"
            onClick={handleMarkAll}
            disabled={readyLoads.length === 0 || markEntered.isPending}
          >
            Mark All Entered ({readyLoads.length})
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "pending", "assigned", "ready", "validated"] as const).map(
            (filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all cursor-pointer ${
                  activeFilter === filter
                    ? "bg-primary-container/10 text-primary-container"
                    : "text-on-surface/40 hover:bg-surface-container-high hover:text-on-surface/60"
                }`}
              >
                {filter}{" "}
                <span className="font-label opacity-60">
                  {filterCounts[filter]}
                </span>
              </button>
            ),
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-on-surface/40 font-label">
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary" />
            {filterCounts.validated} validated
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-container" />
            {filterCounts.ready} ready
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-surface/30" />
            {filterCounts.pending} pending
          </span>
        </div>
      </div>

      {/* Bulk validate bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 pt-3 border-t border-on-surface/5">
          <button
            onClick={handleBulkValidate}
            disabled={confirmMutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            Validate Selected ({selectedIds.size})
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-on-surface/40 hover:text-on-surface/60 cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}
    </>
  )}
</div>;
```

- [ ] **Step 5: Replace load sections with filtered view + validation badges**

Remove the separate pending/assigned/ready load sections (everything from `{/* Loading State */}` through `{/* Dispatch Ready loads */}` — roughly lines 278-538). Replace with a single unified list that uses `filteredLoads`:

```tsx
{
  /* Loading State */
}
{
  deskQuery.isLoading && selectedWellId && (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-surface-container-lowest rounded-xl h-48 animate-pulse"
        />
      ))}
    </div>
  );
}

{
  /* Smart Well Picker: No well selected */
}
{
  !selectedWellId && (
    <div className="space-y-4">
      <h3 className="text-xs uppercase tracking-[0.2em] font-black text-on-surface/40 px-2">
        Pick a Well{" "}
        <span className="text-on-surface/20">
          -- showing wells with dispatch-ready or assigned loads
        </span>
      </h3>
      {wellsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-container-lowest rounded-xl h-20 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {(wellsQuery.data as Array<Record<string, unknown>> | undefined)
            ?.map((w) => ({
              id: String(w.id ?? ""),
              name: String(w.name ?? ""),
              totalLoads: Number(w.totalLoads ?? w.total_loads ?? 0),
              ready: Number(w.ready ?? 0),
              assigned: Number(w.assigned ?? 0),
            }))
            .filter((w) => w.totalLoads > 0)
            .sort(
              (a, b) =>
                b.ready + b.assigned - (a.ready + a.assigned) ||
                b.totalLoads - a.totalLoads,
            )
            .map((w) => (
              <button
                key={w.id}
                onClick={() => handleSelectWell(w.id)}
                className="w-full bg-surface-container-lowest hover:bg-surface-container-high rounded-xl p-5 flex items-center justify-between transition-all cursor-pointer group border border-on-surface/5 text-left hover-lift"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-2 h-10 rounded-full ${w.ready > 0 ? "bg-tertiary" : w.assigned > 0 ? "bg-primary-container" : "bg-on-surface/10"}`}
                  />
                  <div>
                    <h4 className="font-bold text-on-surface text-lg group-hover:text-primary-container transition-colors">
                      {w.name}
                    </h4>
                    <span className="font-label text-xs text-on-surface/40">
                      {w.totalLoads} total loads
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {w.ready > 0 && (
                    <div className="text-right">
                      <span className="font-label text-lg font-bold text-tertiary">
                        {w.ready}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-on-surface/30 block tracking-wider">
                        Ready
                      </span>
                    </div>
                  )}
                  {w.assigned > 0 && (
                    <div className="text-right">
                      <span className="font-label text-lg font-bold text-primary-container">
                        {w.assigned}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-on-surface/30 block tracking-wider">
                        Assigned
                      </span>
                    </div>
                  )}
                  <span className="material-symbols-outlined text-on-surface/20 group-hover:text-primary-container group-hover:translate-x-1 transition-all">
                    arrow_forward
                  </span>
                </div>
              </button>
            ))}
          {wells.length === 0 && (
            <div className="bg-surface-container-lowest rounded-xl p-12 text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface/10 mb-2">
                oil_barrel
              </span>
              <p className="text-on-surface/30 font-label text-sm">
                No wells with loads found
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

{
  /* Empty State */
}
{
  selectedWellId && allLoads.length === 0 && !deskQuery.isLoading && (
    <div className="bg-surface-container-lowest rounded-xl p-16 flex items-center justify-center">
      <div className="text-center space-y-4">
        <span className="material-symbols-outlined text-5xl text-on-surface/10">
          check_circle
        </span>
        <p className="text-sm text-on-surface/30 font-headline font-bold uppercase tracking-widest">
          No loads for this well
        </p>
      </div>
    </div>
  );
}

{
  /* Filtered Load List */
}
{
  selectedWellId && filteredLoads.length > 0 && (
    <div className="space-y-3">
      {filteredLoads.map((load, idx) => {
        const validationStatus = getValidationStatus(load);
        const isValidated = validationStatus === "validated";
        const isMissing = validationStatus === "missing";
        return (
          <div
            key={load.assignmentId}
            className={`relative transition-opacity duration-200 ${!isValidated && !enteredIds.has(load.assignmentId) ? "opacity-60" : ""}`}
          >
            {/* Validation badge overlay */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(load.assignmentId)}
                onChange={() => toggleSelect(load.assignmentId)}
                disabled={isMissing}
                className="w-4 h-4 rounded border-on-surface/20 accent-primary-container cursor-pointer"
              />
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isValidated
                    ? "bg-tertiary/10 text-tertiary"
                    : isMissing
                      ? "bg-error/10 text-error"
                      : "bg-primary-container/10 text-primary-container"
                }`}
              >
                <span
                  className="material-symbols-outlined text-xs"
                  style={{
                    fontVariationSettings: isValidated
                      ? "'FILL' 1"
                      : "'FILL' 0",
                  }}
                >
                  {isValidated
                    ? "verified"
                    : isMissing
                      ? "warning"
                      : "schedule"}
                </span>
                {isValidated
                  ? "Validated"
                  : isMissing
                    ? "Missing Ticket"
                    : "Pending"}
              </div>
            </div>

            <DispatchCard
              loadNo={load.loadNo}
              pcsNumber={
                activeFilter === "ready" && pcsStart
                  ? parseInt(pcsStart) + idx
                  : null
              }
              driverName={load.driverName}
              truckNo={load.truckNo}
              carrierName={load.carrierName}
              productDescription={load.productDescription}
              weightTons={load.weightTons}
              bolNo={load.bolNo}
              ticketNo={load.ticketNo}
              wellName={load.wellName}
              photoStatus={load.photoStatus}
              canEnter={load.canEnter}
              entered={enteredIds.has(load.assignmentId)}
              onMarkEntered={() => handleMarkSingle(load.assignmentId)}
              isPending={markEntered.isPending}
              loadId={load.loadId}
              deliveredOn={load.deliveredOn}
              photoUrls={(load as any).photoUrls}
            />
          </div>
        );
      })}
    </div>
  );
}

{
  /* Photo Modal */
}
{
  photoModalLoad && (
    <PhotoModal
      photoUrls={photoModalLoad.photoUrls || []}
      loadNo={photoModalLoad.loadNo}
      wellName={photoModalLoad.wellName}
      bolNo={photoModalLoad.bolNo}
      driverName={photoModalLoad.driverName}
      truckNo={photoModalLoad.truckNo}
      carrierName={photoModalLoad.carrierName}
      weightTons={photoModalLoad.weightTons}
      ticketNo={photoModalLoad.ticketNo}
      autoMapScore={photoModalLoad.autoMapScore || null}
      onClose={() => setPhotoModalLoad(null)}
      onValidate={() => {
        handleValidateSingle(photoModalLoad.assignmentId);
        setPhotoModalLoad(null);
      }}
    />
  );
}
```

- [ ] **Step 6: Verify the full page renders**

Navigate to `http://localhost:5180/dispatch-desk`
Expected: Well picker shows with hover-lift. Selecting a well shows command bar with filter tabs, date filter, presence dots, validation badges on each card. Filter tabs switch between load subsets.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/DispatchDesk.tsx
git commit -m "feat: dispatch desk command bar with filter tabs, validation badges, bulk validate, date filter"
```

---

### Task 6: Apply hover-lift to Exception Feed well rows

**Files:**

- Modify: `frontend/src/pages/ExceptionFeed.tsx`

- [ ] **Step 1: Add hover-lift class to well rows**

In the well row div (currently at line 227), add `hover-lift` to the className:

Change:

```tsx
className =
  "bg-surface-container-low hover:bg-surface-container-high transition-all group cursor-pointer flex flex-col md:flex-row md:items-center p-6 gap-6";
```

To:

```tsx
className =
  "bg-surface-container-low hover:bg-surface-container-high transition-all group cursor-pointer flex flex-col md:flex-row md:items-center p-6 gap-6 hover-lift";
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ExceptionFeed.tsx
git commit -m "style: add hover-lift depth to Exception Feed well rows"
```

---

### Task 7: Final Verification Pass

- [ ] **Step 1: Verify all pages load without errors**

Navigate through each page in sequence:

- `http://localhost:5180/` — "Today's Objectives" header, 4-column wells, validation progress
- `http://localhost:5180/dispatch-desk` — Well picker with hover-lift, command bar when well selected
- `http://localhost:5180/bol` — Unchanged, still works
- `http://localhost:5180/validation` — Still accessible under admin nav

Check browser console for React errors or missing imports.

- [ ] **Step 2: Verify retained features**

- Toast: trigger a mutation (approve, mark entered) — toast slides in from right
- Presence: green dots visible in sidebar and well header
- Logout: button visible at bottom of sidebar, clicking redirects to login
- Keyboard: Tab through elements, focus rings visible

- [ ] **Step 3: Verify cream/purple palette renders correctly**

- Backgrounds should be warm cream (#f5f0e8 scale)
- Primary buttons should be deep purple (#6d28d9)
- Success states should be green (#0d9668)
- Text should be near-black (#1e1b18) on cream

No dark navy anywhere. If any component still shows dark colors, it means a hardcoded color — search for hex values and replace with semantic tokens.

- [ ] **Step 4: Clean up mockup file**

```bash
rm frontend/mockups-jess-meeting.html
git add -A && git status
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass — remove mockup file, confirm all pages render"
```
