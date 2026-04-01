# EsExpress v2 Frontend — Handoff

## Resume Command

```bash
cd ~/projects/work/EsExpress/esexpress-v2/frontend && pnpm dev --host 0.0.0.0
```

## Current State

Backend is **done**. Frontend scaffolding is built (React 19, routing, hooks, types, API client). The Stitch HTML designs look correct when served as static files. The React components look flat/broken because **Tailwind v4's `@layer theme` clobbers our CSS custom properties** that share names with TW4 built-ins (`--text-*`, `--radius-*`, `--shadow-*`, `--font-mono`).

## The Problem (Solved, Not Yet Fixed)

Tailwind v4 defines built-in theme variables like `--text-xs: 0.75rem`, `--radius-md: 0.375rem`, `--shadow-lg: ...` in its `@layer theme`. Our tokens.css used the SAME variable names. TW4's layer runs after our imports, overwriting everything. Result: wrong radii, wrong font sizes, wrong shadows, wrong fonts. Cards look flat because borders/radii are TW4 defaults, not ours.

**Fix:** Tokens renamed to `es-` prefix (`--es-bg-surface`, `--es-text-primary`, `--es-radius-lg`, etc.) in `src/tokens.css` and `src/global.css`. CSS utility classes use `es-` prefix (`.es-surface`, `.es-well-row`, `.es-pill-ready`, etc.). ExceptionFeed.tsx and Sidebar.tsx updated to use `es-` classes.

**But:** The remaining page components (WellWorkspace, BolQueue, DispatchConfirmation, admin pages, Login, etc.) still use the old un-prefixed `var(--bg-surface)` pattern. They need updating to `var(--es-bg-surface)`.

## What Needs to Happen

### Option A: Fix All Pages (Recommended)

1. Update every page component to use `es-` prefixed tokens
2. Use `.es-surface`, `.es-well-row`, etc. CSS classes for card styling
3. Use inline `style={{ color: "var(--es-text-primary)" }}` for dynamic colors
4. Keep Tailwind for layout only: `flex`, `grid`, `p-*`, `gap-*`, `space-y-*`, etc.

### Option B: Port Stitch's Tailwind Config

1. Take the Stitch HTML's tailwind.config (Material Design 3 colors) and put those in our `@theme`
2. This makes Stitch class names like `bg-surface-container`, `text-on-surface` work natively
3. Less work per page, but ties us to Stitch's color vocabulary

## Key Files

| File                                 | Purpose                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `src/tokens.css`                     | CSS custom properties (es-\* prefixed, dark+light)                             |
| `src/global.css`                     | Utility classes (.es-surface, .es-well-row, .es-pill-\*, .es-btn-accent, etc.) |
| `tailwind.css`                       | Tailwind v4 entry + @theme config (needs cleanup)                              |
| `src/pages/ExceptionFeed.tsx`        | Updated to es-\* tokens ✓                                                      |
| `src/pages/WellWorkspace.tsx`        | Needs es-\* update                                                             |
| `src/pages/BolQueue.tsx`             | Needs es-\* update                                                             |
| `src/pages/DispatchConfirmation.tsx` | Needs es-\* update                                                             |
| `src/pages/admin/*.tsx`              | Need es-\* update                                                              |
| `src/pages/Login.tsx`                | Needs es-\* update                                                             |
| `src/pages/Settings.tsx`             | Needs es-\* update                                                             |
| `src/pages/FinanceBatches.tsx`       | Needs es-\* update                                                             |
| `src/components/Sidebar.tsx`         | Updated to es-\* ✓                                                             |
| `public/stitch-preview.html`         | Working Stitch HTML proof — design looks correct here                          |

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
