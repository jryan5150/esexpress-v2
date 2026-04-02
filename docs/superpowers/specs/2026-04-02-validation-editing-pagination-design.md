# Validation Editing + Pagination Design

**Date:** 2026-04-02
**Scope:** Inline well editing on validation page, reusable pagination, backend pagination support

## Problem

The validation page has three gaps:

1. Tier 3 (unmapped loads) shows Confirm/Reject buttons that can't work — there's no assignment to confirm
2. Tier 1/2 rows can only confirm or reject — no way to reassign to a different well
3. All list pages (Validation, BOL Queue, Dispatch Desk) dump all rows at once with no pagination

## Design

### 1. WellPicker Component

**File:** `frontend/src/components/WellPicker.tsx`

A reusable inline well selector. Renders as a clickable well name; on click, transforms into a searchable dropdown.

**Props:**

```typescript
interface WellPickerProps {
  loadId: number;
  assignmentId: number | null; // null for Tier 3 (no assignment yet)
  currentWellId: number | null;
  currentWellName: string;
  onResolved: () => void; // callback after successful assign/reassign
}
```

**Behavior:**

- Default state: renders well name as clickable text (styled as link)
  - Tier 3 shows "-- Unresolved --" in error color
- Click opens dropdown with three sections:
  1. **Suggestions** (top): from `GET /dispatch/suggest/:loadId` — scored, with confidence badges. Only shown if suggestions exist.
  2. **All Wells** (middle): from cached `GET /dispatch/wells/` — filtered by search input. Shows well name and status.
  3. **Create New** (footer): "+ Create New Well" button. Click reveals inline text input + confirm. Calls `POST /dispatch/wells/` with `{ name }`, then auto-selects the new well.
- On well selection:
  - If `assignmentId` is null (Tier 3): `POST /dispatch/validation/resolve` with `{ loadId, wellId }`
  - If `assignmentId` exists (Tier 1/2 reassign): `POST /dispatch/validation/reject` with `{ assignmentId }`, then `POST /dispatch/validation/resolve` with `{ loadId, wellId }`
- Close on Escape or click-away without changes
- Loading spinner during API calls, disabled state while pending

**Hooks:**

- `useWells()` — already exists, provides well list
- `useWellSuggestions(loadId)` — new hook, calls `GET /dispatch/suggest/:loadId`
- `useManualResolve()` — new mutation hook, calls `POST /dispatch/validation/resolve`

### 2. Pagination Component

**File:** `frontend/src/components/Pagination.tsx`

Reusable pagination bar for all list pages.

**Props:**

```typescript
interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}
```

**Renders:**

- Left: "Showing X-Y of Z"
- Center: Previous / Page N of M / Next (buttons)
- Right: Page size selector (25 | 50 | 100)

**Behavior:**

- Previous disabled on page 1, Next disabled on last page
- Changing page size resets to page 1
- All controls disabled when `loading=true`

### 3. Validation Page Changes

**File:** `frontend/src/pages/Validation.tsx`

**All tiers (Tier 1, 2, 3):**

- The "Destination → Well" column renders `<WellPicker>` instead of static text
- Clicking the well name opens the picker for reassignment
- After resolution, `onResolved` invalidates validation + assignment queries

**Tier 1/2 rows:**

- Keep Confirm and Reject buttons as-is
- WellPicker added as an edit capability on the well name

**Tier 3 rows:**

- Remove Confirm/Reject buttons entirely
- WellPicker on "-- Unresolved --" is the primary action
- Expanded detail panel adds a prominent "Assign to Well" button that focuses the WellPicker

**Pagination per tier section:**

- Each tier section manages its own `page` + `pageSize` state
- Tier summary cards still show total counts from the summary endpoint (unchanged)
- `<Pagination>` component rendered below each tier's row list

**State changes:**

- Add `page`/`pageSize` state per tier (or a single record keyed by tier number)
- Pass to query hooks: `useValidationTier(tier, { page, pageSize })`

### 4. BOL Queue Changes

**File:** `frontend/src/pages/BolQueue.tsx`

- Add `page`/`pageSize` state
- Pass to `useBolQueue({ page, pageSize })`
- Render `<Pagination>` below the submissions list
- Stats section unchanged

### 5. Dispatch Desk Changes

**File:** `frontend/src/pages/DispatchDesk.tsx`

- Already has pagination params in the backend (`page`/`limit`)
- Add `page`/`pageSize` state, pass to `useDispatchDeskLoads`
- Render `<Pagination>` below the load list

### 6. Backend Pagination

Two endpoints need `page`/`limit` support:

**`GET /dispatch/validation/tier/:n`** — `validation.ts` + `validation.service.ts`

- Add `page` (default 1) and `limit` (default 50) query params
- Service function takes `{ page, limit }`, applies `.limit(limit).offset((page - 1) * limit)`
- Return shape: `{ success: true, data: [...], meta: { tier, page, limit, total } }`
- Total count via separate `count(*)` query (same where clause, no limit)

**`GET /verification/jotform/queue`** — `jotform.ts`

- Same pattern: add `page`/`limit` query params
- Return `{ data: [...], meta: { page, limit, total } }`

### 7. Frontend Hooks

New/modified hooks in `frontend/src/hooks/`:

**New: `useWellSuggestions(loadId)`** in `use-wells.ts`

```typescript
export function useWellSuggestions(loadId: number | null) {
  return useQuery({
    queryKey: ["suggestions", loadId],
    queryFn: () => api.get(`/dispatch/suggest/${loadId}`),
    enabled: loadId !== null,
  });
}
```

**New: `useManualResolve()`** in `use-wells.ts`

```typescript
export function useManualResolve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { loadId: number; wellId: number }) =>
      api.post("/dispatch/validation/resolve", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.validation.all });
      qc.invalidateQueries({ queryKey: qk.assignments.all });
      qc.invalidateQueries({ queryKey: qk.wells.all });
    },
  });
}
```

**Modified: `useValidationTier()`** — currently inline in Validation.tsx, extract to hook with pagination params.

**Modified: `useBolQueue()`** — add `page`/`pageSize` params.

**Modified: `useDispatchDeskLoads()`** — already has filter support, just needs `page`/`pageSize` passed through.

## Existing Endpoints Used (No Changes Needed)

| Endpoint                            | Used By                                  |
| ----------------------------------- | ---------------------------------------- |
| `GET /dispatch/suggest/:loadId`     | WellPicker suggestions                   |
| `GET /dispatch/wells/`              | WellPicker well list                     |
| `POST /dispatch/wells/`             | WellPicker "Create New Well"             |
| `POST /dispatch/validation/resolve` | WellPicker assign (Tier 3 + reassign)    |
| `POST /dispatch/validation/confirm` | Validation confirm button                |
| `POST /dispatch/validation/reject`  | Validation reject button + reassign flow |

## Files Changed

| File                                                          | Change                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `frontend/src/components/WellPicker.tsx`                      | **New** — reusable inline well selector                                       |
| `frontend/src/components/Pagination.tsx`                      | **New** — reusable pagination bar                                             |
| `frontend/src/pages/Validation.tsx`                           | Replace static well name with WellPicker, Tier 3 actions, pagination per tier |
| `frontend/src/pages/BolQueue.tsx`                             | Add pagination                                                                |
| `frontend/src/pages/DispatchDesk.tsx`                         | Add pagination                                                                |
| `frontend/src/hooks/use-wells.ts`                             | Add `useWellSuggestions`, `useManualResolve`, modify `useDispatchDeskLoads`   |
| `frontend/src/hooks/use-bol.ts`                               | Modify `useBolQueue` for pagination params                                    |
| `backend/src/plugins/dispatch/routes/validation.ts`           | Add page/limit to tier endpoint                                               |
| `backend/src/plugins/dispatch/services/validation.service.ts` | Add pagination to `getAssignmentsByTier`                                      |
| `backend/src/plugins/verification/routes/jotform.ts`          | Add page/limit to queue endpoint                                              |

## Out of Scope

- JotForm submissions tab (separate feature — BOL Queue already shows JotForm data)
- Well workspace page
- Reassign confirmation modal (keeping it direct — click well, pick new one, done)
- Keyboard navigation in WellPicker (can add later)
