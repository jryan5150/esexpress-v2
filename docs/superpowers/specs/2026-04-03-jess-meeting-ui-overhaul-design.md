# Jess Meeting UI Overhaul — April 3, 2026

## Summary

Restructure the ES Express v2 frontend based on feedback from Jessica Handlin's meeting. The core changes merge validation into dispatch desk, rename Exception Feed to "Today's Objectives", add date filtering and validation status indicators, and use the cream/purple color scheme from commit `f3c0565`.

## Color Scheme

Use the existing cream/purple palette already in `tailwind.css`:

- Background: `#f5f0e8` (warm cream)
- Primary: `#6d28d9` (deep purple) / `#7c3aed` (purple)
- Tertiary: `#0d9668` (green success)
- Error: `#dc2626` (red)
- Text: `#1e1b18` (near-black on cream)

All component classes already reference the semantic tokens (`bg-surface-container-low`, `text-primary-container`, etc.) — no per-component color changes needed. The palette swap is already done.

## Retained Features (do not remove)

- **Toast notifications** — `ToastProvider` / `useToast` system stays as-is
- **Live presence tracking** — `usePresence` / `useHeartbeat` hooks, green dots in sidebar and well headers
- **Keyboard accessibility** — `:focus-visible` rings, `prefers-reduced-motion`

## Animations & Depth

Add subtle professional polish (not heavy):

- `transition-all duration-200` on interactive rows and cards (already partly there)
- Hover states: slight background shift via existing `hover:bg-surface-container-high`
- Toast entrance: slide-in from right with fade (`animate-slide-in`)
- Card hover: subtle `translate-y-[-1px]` lift + soft shadow
- No parallax, no bouncy springs, no complex keyframes

## Changes

### 1. Sidebar Navigation Restructure

**File:** `frontend/src/components/Sidebar.tsx`

Current nav order:

1. Exception Feed
2. BOL Queue
3. Dispatch Desk
4. Validation
5. Admin: Wells, Companies, Users
6. Operations: Finance

Proposed nav order:

1. **Today's Objectives** (icon: `home`) — renamed from Exception Feed
2. **Dispatch Desk** (icon: `local_shipping`)
3. **BOL Queue** (icon: `description`)
4. **Admin section:** Validation, Wells, Companies, Users
5. **Operations section:** Finance

Also ensure:

- Log Out button at bottom (already exists, just verify it persists)
- Settings link at bottom (already exists)
- Live presence section stays at bottom

### 2. Dispatch Desk — Merge Validation + Command Bar

**File:** `frontend/src/pages/DispatchDesk.tsx`

When a well is selected, replace the current well header with a **command bar**:

**Command bar top row:**

- Well name (prominent, left)
- Presence indicators (existing, next to well name)
- Date filter dropdown (new — filter by delivery date range)
- Download Photos button (existing)
- Mark All Entered button (existing)

**Command bar filter tabs (new):**

- All | Pending | Assigned | Ready | Validated — each with count
- Clicking a tab filters the load list
- Active tab styled with `bg-primary-container/10 text-primary-container`

**Status summary bar (new):**

- Below tabs: "20 validated · 14 ready · 30 assigned · 12 pending" with colored dots

**Validation controls (new):**

- Each load row gets a validation status badge on the left:
  - Green `verified` icon = validated
  - Orange `schedule` icon = pending validation
  - Red `warning` icon = missing ticket
- Rows not validated get `opacity-55` dimming
- Checkboxes on each row for bulk selection
- "Validate Selected" and "Validate All Matched" buttons appear in command bar when applicable
- Individual "Validate" button per row for pending items

**Inline editing (new):**

- Load fields (driver, carrier, weight, BOL#, ticket#) become editable on click
- Use a simple click-to-edit pattern: display → click → input → blur/enter saves
- Call existing API mutation to persist

**Photo modal (new):**

- BOL/ticket photo thumbnails shown inline on rows
- Clicking opens an **in-window modal overlay** (not a new tab)
- Modal shows: large photo, load details side panel, photo navigation (prev/next), "Validate This Load" button, "Flag Issue" button
- Uses backdrop blur + glassmorphism styling

### 3. Exception Feed → Today's Objectives

**File:** `frontend/src/pages/ExceptionFeed.tsx`

Rename the page. Update the header text and sidebar reference. Add:

- Validation progress per well: "30/76 validated" with a progress bar in the well list
- The rest of the layout stays the same — action-required card, system-handled stats, wells overview, dispatch pipeline

### 4. Route Update

**File:** `frontend/src/App.tsx` (or wherever routes are defined)

- Route `/` still maps to ExceptionFeed (now rendered as "Today's Objectives")
- Route `/validation` still works (for admin-level access) but Validation moves to admin section in sidebar

## Files to Modify

| File                | Change                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `Sidebar.tsx`       | Nav restructure, rename, reorder                                                                  |
| `DispatchDesk.tsx`  | Command bar, filter tabs, validation badges, bulk validate, date filter, inline edit, photo modal |
| `ExceptionFeed.tsx` | Rename to "Today's Objectives", add validation progress per well                                  |
| `tailwind.css`      | Add `animate-slide-in` keyframe for toasts, subtle card hover utilities                           |
| `DispatchCard.tsx`  | Add validation badge prop, checkbox prop, inline-edit fields                                      |

## Files NOT to Modify

- `Toast.tsx` — keep as-is
- `use-presence.ts` / `use-auth.ts` — keep as-is
- Backend routes — no changes needed
- `Login.tsx`, `Settings.tsx`, admin pages — no changes

## Out of Scope (deferred)

- Missing tickets bucket/workflow (start simple with date sorting)
- Sidebar collapse/minimize on dispatch
- Mobile/iPad optimization
- BOL reconciliation side panel
