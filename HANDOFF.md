# EsExpress v2 Frontend — Handoff

## Resume Command

```bash
cd ~/projects/work/EsExpress/esexpress-v2/frontend && pnpm dev --host 0.0.0.0
```

## Current State

Backend is **done**. Frontend scaffold is built (React 19, routing, hooks, types, API client). **Tailwind v4 token collision is fixed** — all CSS custom properties use `es-` prefix (`--es-bg-surface`, `--es-text-primary`, `--es-radius-lg`, etc.) across all 12 component files, tokens.css, global.css, and the `@theme` block in tailwind.css. TypeScript compiles clean.

**Not yet visually verified in browser** — start the dev server and confirm pages render with correct colors, radii, shadows, and fonts.

## What Was Fixed (2026-04-01)

Tailwind v4's `@layer theme` was clobbering our CSS custom properties that shared names with TW4 built-ins (`--text-*`, `--radius-*`, `--shadow-*`, `--font-mono`). All tokens renamed to `es-` prefix. All 12 `.tsx` files updated. The `@theme` block in `tailwind.css` now bridges `es-*` tokens to TW4 utility classes. Font-size ambiguities (`text-[var(--text-xs)]`) replaced with native TW classes (`text-xs`).

## What Needs to Happen Next

### 1. Visual verification (5 min)

Start dev server. Confirm ExceptionFeed, WellWorkspace, BolQueue, Sidebar, Login all render with the dark industrial theme — correct card surfaces, orange accent, mono fonts, rounded corners. If anything looks flat or wrong-colored, the token wiring has a gap.

### 2. Extract shared components (medium effort)

The plan calls for reusable primitives that are currently inlined in page files:

- `StatusChip` — status pill/badge (duplicated across ExceptionFeed, WellWorkspace, BolQueue, DispatchConfirmation)
- `LoadRow` — compact load table row with expand (duplicated in WellWorkspace, BolQueue)
- `VerificationRow` — BOL/Weight/Photo inline check indicators
- `ExceptionGroup` — collapsible status section with count header
- `ActionBar` — sticky bottom bar for bulk actions (duplicated in WellWorkspace, BolQueue, DispatchConfirmation)
- `Toast` — notification wrapper (not yet implemented)
- `OperatorPresence` — presence dot component

### 3. Stitch design fidelity pass (larger effort)

Compare each page against its Stitch HTML export and close visual gaps. The Stitch preview at `public/stitch-preview.html` is the reference.

### 4. Keyboard shortcuts + selection (small effort)

- `use-keyboard.ts` — hotkey registration (planned but not built)
- `use-selection.ts` — multi-select + bulk action state (planned but not built)

## Key Files

| File                                 | Status                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `src/tokens.css`                     | es-\* prefixed, dark+light themes                                        |
| `src/global.css`                     | Utility classes (.es-surface, .es-well-row, .es-pill-\*, .es-btn-accent) |
| `tailwind.css`                       | TW4 entry + @theme bridging es-\* tokens to TW utilities                 |
| `src/pages/ExceptionFeed.tsx`        | Updated                                                                  |
| `src/pages/WellWorkspace.tsx`        | Updated                                                                  |
| `src/pages/BolQueue.tsx`             | Updated                                                                  |
| `src/pages/DispatchConfirmation.tsx` | Updated                                                                  |
| `src/pages/Login.tsx`                | Updated                                                                  |
| `src/pages/Settings.tsx`             | Updated                                                                  |
| `src/pages/FinanceBatches.tsx`       | Updated                                                                  |
| `src/pages/admin/*.tsx`              | Updated (4 files)                                                        |
| `src/components/Sidebar.tsx`         | Updated                                                                  |
| `src/components/Button.tsx`          | Updated                                                                  |
| `src/components/Layout.tsx`          | Clean (no token refs)                                                    |

## Stitch Exports

All 16 screen designs from Google Stitch are at `/tmp/stitch-exports/`:

- `landing_page/.../exception_feed_v4_refined/` — best Exception Feed
- `landing_page/.../well_workspace_pendleton_1h_v4/` — best Well Workspace
- `landing_page/.../bol_queue_v4_refined/` — best BOL Queue
- `landing_page/.../dispatch_confirmation_v4_refined/` — best Dispatch Confirmation
- `exception_feed/stitch_exception_feed/admin_*` — admin screens
- `exception_feed/stitch_exception_feed/login/` — login
- `exception_feed/stitch_exception_feed/finance_batches/` — finance
- `exception_feed/stitch_exception_feed/general_settings/` — settings

## Design Spec

`/home/jryan/projects/work/EsExpress/docs/specs/2026-03-31-v2-frontend-design.md`

## Implementation Plan

`/home/jryan/projects/work/EsExpress/docs/plans/2026-03-31-v2-frontend-implementation.md`

Plan has 11 tasks, all unchecked (predates implementation). Tasks 1-4, 7 are effectively done. Tasks 5-6 (component extraction), 8 (keyboard shortcuts), 9-10 (wiring with real components) remain.
