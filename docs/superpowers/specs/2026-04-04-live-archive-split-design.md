# ES Express v2 — Live/Archive Split Design Spec

**Date:** 2026-04-04
**Status:** Approved design, pending implementation plan
**Authors:** jryan + Claude

---

## Problem

The dispatch desk shows all loads across all time — 25k+ matches. Dispatchers work with today's loads (and this week's loads). The historical mass creates intimidation, slows queries, and puts irrelevant data in the daily workflow's line of sight. Dispatchers need a focused workspace for current operations and a quiet, accessible reference layer for everything else.

## Solution

Split the single frontend into two zones within one app:

- **Live zone** — 2026+ loads. The daily dispatch workspace. Every existing page (`/dispatch-desk`, `/bol`, `/finance`, `/validation`) filters to live loads only.
- **Archive zone** — Pre-2026 loads. A lazy-loaded `/archive` route for browsing and referencing historical loads. Read-mostly with edit available.
- **Smart search** — `Cmd+K` spotlight overlay that searches both zones simultaneously and routes the dispatcher to the right place based on results.
- **Breadcrumb capture** — Invisible behavioral event capture from day one, accumulating signal for future intelligence placement.

One backend. One database. One Railway instance. One deploy.

---

## Architecture Decisions

### Why Route-Based Split (not separate sites or backend-only filter)

| Option                                  | Rejected because                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Two separate frontends (A/B subdomains) | Search bar can't bridge sites seamlessly. Two deploys, two mental models. Overengineered for 4-5 dispatchers.                              |
| Backend filter only (no archive UI)     | Historical loads shown in live UI context is confusing. No dedicated space for future learning engine.                                     |
| **Route-based split (chosen)**          | One deploy, lazy-loaded archive costs nothing until visited, search bridges naturally, `/archive` zone ready for intelligence layer later. |

### Why hard 2026 cutoff (not rolling window)

Start with the simplest cut that solves today's pain. By summer 2026 we'll have real data on load volume growth to decide if a rolling window matters. Hybrid approach: ship the hard cutoff now, revisit with rolling window when data informs the decision.

### Production environment context

This is an internal tool used by 4-5 dispatchers at ES Express, deployed on Railway (single backend service + single frontend service). Guardrails are calibrated to this reality:

- Error boundaries are sufficient isolation (separate builds would matter at 10k+ users)
- CI smoke tests on both zones catch regressions before deploy
- Query cache namespacing prevents cross-zone data pollution
- The threshold where this decision flips to separate builds: if the archive zone grows complex enough to have its own deploy cadence or if the team grows beyond ~20 users

---

## Frontend Architecture

### File Structure

```
frontend/src/
├── app.tsx                        ← router: live routes + lazy archive routes
├── components/                    ← shared (LoadRow, ExpandDrawer, PhotoModal)
├── hooks/                         ← shared (useLoads, useAuth)
├── pages/                         ← live zone (DispatchDesk, Finance, BolQueue)
├── archive/                       ← archive zone (self-contained)
│   ├── pages/
│   │   ├── ArchiveSearch.tsx      ← browse/filter pre-2026 loads
│   │   └── ArchiveLoadDetail.tsx  ← single load view with edit
│   ├── components/                ← archive-only components if needed
│   └── hooks/                     ← archive-specific query hooks (era: 'archive')
├── search/                        ← Cmd+K spotlight (bridges both zones)
│   ├── SearchOverlay.tsx
│   ├── useGlobalSearch.ts         ← parallel live + archive queries
│   └── SearchResult.tsx
└── breadcrumbs/                   ← behavioral capture (invisible)
    ├── useBreadcrumb.ts           ← hook that fires events
    └── breadcrumb-client.ts       ← batched fire-and-forget POST
```

### Dependency Rules

- `archive/` can import from `components/`, `hooks/` (shared) — **never the reverse**
- `search/` can import from both — it's the bridge
- `pages/` (live) never imports from `archive/`
- Shared components that need archive-specific behavior get it via props, not zone-checking conditionals
- Archive-specific components live in `archive/components/` rather than adding conditionals to shared components

### Route Structure

```tsx
// app.tsx
const ArchiveSearch = lazy(() => import("./archive/pages/ArchiveSearch"));
const ArchiveLoadDetail = lazy(
  () => import("./archive/pages/ArchiveLoadDetail"),
);

<Routes>
  {/* Live zone — existing routes, unchanged */}
  <Route path="/" element={<ExceptionFeed />} />
  <Route path="/dispatch-desk" element={<DispatchDesk />} />
  <Route path="/bol" element={<BolQueue />} />
  <Route path="/finance" element={<Finance />} />
  <Route path="/validation" element={<Validation />} />
  {/* ... admin routes ... */}

  {/* Archive zone — lazy loaded, error-bounded */}
  <Route path="/archive" element={<ArchiveErrorBoundary />}>
    <Route index element={<ArchiveSearch />} />
    <Route path="load/:id" element={<ArchiveLoadDetail />} />
  </Route>
</Routes>;
```

### Error Boundary Isolation

```
<App>
  <ErrorBoundary>                              ← app-level (catastrophic)
    <SearchOverlay />                          ← always available
    <BreadcrumbProvider />                     ← always capturing
    <LiveRoutes />                             ← dispatch-desk, bol, finance
    <ErrorBoundary fallback="Archive unavailable, use search">
      <Suspense fallback={<ArchiveLoading />}>
        <ArchiveRoutes />                      ← lazy loaded, fully isolated
      </Suspense>
    </ErrorBoundary>
  </ErrorBoundary>
</App>
```

If any archive component throws, dispatchers see a fallback message. Live dispatch desk is completely unaffected. If the archive lazy chunk fails to load (network, build error), only archive breaks.

### Query Cache Namespacing

React Query keys are namespaced by zone to prevent cross-pollution:

```typescript
// Live queries
useQuery(['dispatch-loads', { era: 'live', wellId, date }], ...)

// Archive queries
useQuery(['dispatch-loads', { era: 'archive', wellId, date }], ...)

// Search queries (no era — searches everything)
useQuery(['search', { q: searchTerm }], ...)
```

A dispatcher browsing 25k archive loads does not pollute the live dispatch cache. These are independent cache entries.

---

## Smart Search Bar

### Trigger

`Cmd+K` (Mac) / `Ctrl+K` (Windows) opens a spotlight-style overlay. Also triggered by `/` when focus is not in a text input. Escape or click-outside closes it.

### Behavior

1. Dispatcher types a query (load number, BOL, driver name, well name, carrier name)
2. Single API call to `GET /api/v1/search?q=<term>` — backend queries both eras internally and returns results tagged by zone
3. Results are grouped by zone, not interleaved:

```
┌─────────────────────────────────────┐
│  🔍  4821                        ⌘K │
├─────────────────────────────────────┤
│  Current Loads                      │
│    Load #4821 · Martinez · CHKLA    │
│    Load #48210 · Ruiz · PERM        │
│                                     │
│  Archive · 2025                     │
│    Load #4821 · Smith · Nov '25     │
│    Load #14821 · Jones · Aug '25    │
└─────────────────────────────────────┘
```

4. Clicking a live result stays in dispatch desk (scrolls to load, expands drawer)
5. Clicking an archive result navigates to `/archive/load/:id`

### Edge Cases

- **No live results, only archive:** Archive section appears first with subtle note: "No current loads found · showing archive results"
- **Exact match in archive:** Confidence badge on the result — the system knows, it isn't guessing
- **No results anywhere:** "No loads found for [query]"
- **Empty query:** Show recent searches or nothing (no suggestions yet — intelligence layer territory)

### Search Fields

Searches across: `loadNo`, `bolNo`, `ticketNo`, `driverName`, `wellName`, `carrierName`

### What Search Does NOT Do (Yet)

- Natural language queries ("Martinez loads from November")
- Cross-field fuzzy matching
- Search suggestions / autocomplete from behavioral data

These are future intelligence layer features, informed by breadcrumb data.

---

## Backend: Era Middleware

### Query Parameter

All existing dispatch endpoints accept an optional `?era=live|archive` parameter:

- `era=live` — adds `WHERE loads.delivered_on >= '2026-01-01'`
- `era=archive` — adds `WHERE loads.delivered_on < '2026-01-01'`
- `era` omitted — defaults to `live` (fail safe, existing pages don't need changes)

### Implementation

One middleware function applied to dispatch plugin routes:

```typescript
function eraFilter(era: "live" | "archive" | undefined) {
  if (!era || era === "live") {
    return gte(loads.deliveredOn, new Date("2026-01-01T00:00:00-06:00"));
  }
  return lt(loads.deliveredOn, new Date("2026-01-01T00:00:00-06:00"));
}
```

Enforced in one place, not sprinkled across queries. If the middleware has a bug, it fails closed (no loads returned) rather than leaking archive into live.

### New Endpoint: Search

```
GET /api/v1/search?q=<term>&limit=10
```

Returns results from both eras, tagged:

```json
{
  "live": [
    {
      "id": "...",
      "loadNo": "4821",
      "driverName": "Martinez",
      "wellName": "CHKLA",
      "deliveredOn": "2026-03-15"
    }
  ],
  "archive": [
    {
      "id": "...",
      "loadNo": "4821",
      "driverName": "Smith",
      "wellName": "PERM",
      "deliveredOn": "2025-11-02"
    }
  ]
}
```

Searches `loadNo`, `bolNo`, `ticketNo` with prefix match; `driverName`, `wellName`, `carrierName` with case-insensitive contains. Limited to 10 results per era.

---

## Breadcrumb Capture

### Purpose

Invisible behavioral signal capture from day one. No analysis, no dashboards — just raw events accumulating. When the intelligence layer is built, this table is the training data for where to place it.

### Database Table

```sql
CREATE TABLE breadcrumbs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  zone TEXT NOT NULL CHECK (zone IN ('live', 'archive', 'search')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_breadcrumbs_event_type ON breadcrumbs(event_type);
CREATE INDEX idx_breadcrumbs_created_at ON breadcrumbs(created_at);
CREATE INDEX idx_breadcrumbs_user_id ON breadcrumbs(user_id);
```

### Events Captured

| Event Type            | Zone         | Event Data                                        |
| --------------------- | ------------ | ------------------------------------------------- |
| `page_view`           | live/archive | `{ page, wellId }`                                |
| `search_query`        | search       | `{ query, liveResultCount, archiveResultCount }`  |
| `search_result_click` | search       | `{ resultEra, resultType, position }`             |
| `load_expanded`       | live/archive | `{ loadId, dwellMs }` (duration on close)         |
| `field_edited`        | live/archive | `{ field, loadId }` (not the value — the pattern) |
| `archive_navigated`   | archive      | `{ source: 'search' \| 'nav' \| 'link' }`         |
| `filter_changed`      | live/archive | `{ filterType, value }`                           |
| `bulk_action`         | live         | `{ action, count }`                               |

### Client Implementation

```typescript
// useBreadcrumb.ts — hook used throughout the app
const { track } = useBreadcrumb();
track("load_expanded", { loadId: "123" }, "live");
```

Events batch in memory, flush every 30 seconds or on `beforeunload`. Fire-and-forget — if the endpoint is down, events are silently dropped. Breadcrumbs never block dispatch work.

### Endpoint

```
POST /api/v1/breadcrumbs
Body: { events: [{ eventType, eventData, zone, timestamp }] }
```

Uses existing session auth (same middleware as other endpoints — needed for `user_id`). No additional permissions required. No response body needed — 202 Accepted.

### What We Do NOT Build Yet

- No dashboard to view breadcrumbs
- No aggregation queries or cron jobs
- No analysis pipeline
- No integration with the intelligence layer

The table accumulates. When it's time to place intelligence, we query it.

---

## CI Guardrails

| Check                       | What It Does                                                | Blocks Deploy?    |
| --------------------------- | ----------------------------------------------------------- | ----------------- |
| Archive lazy chunk builds   | Verifies archive code compiles independently                | Yes               |
| Main bundle size threshold  | Live main chunk must stay under 500KB regardless of archive | Yes               |
| E2E smoke: `/dispatch-desk` | Loads live dispatch desk, verifies data renders             | Yes               |
| E2E smoke: `/archive/loads` | Loads archive, verifies data renders                        | Yes               |
| E2E smoke: `Cmd+K` search   | Opens search, types query, verifies results from both zones | Yes               |
| Import direction lint       | Archives cannot be imported by live pages                   | Yes               |
| Breadcrumb endpoint health  | POST to breadcrumbs returns 202                             | No (warning only) |

---

## Fault Tolerance Summary

| Failure Mode                         | Guardrail                                               | Severity Without It                    |
| ------------------------------------ | ------------------------------------------------------- | -------------------------------------- |
| Archive component crashes            | Error boundary isolates — live unaffected               | High: white screen for dispatchers     |
| Archive chunk fails to load          | Lazy loading + Suspense fallback                        | Medium: archive unavailable, live fine |
| Shared component change breaks live  | One-way dependency rule + CI regression                 | High: dispatch desk down               |
| Archive data leaks into live queries | Era middleware fails closed (no loads, not wrong loads) | Medium: confusing but not destructive  |
| Archive bloats main bundle           | CI bundle size threshold on live chunk                  | Low: gradual performance creep         |
| Dependency upgrade breaks archive    | E2E smoke tests on both zones                           | Medium: caught before deploy           |
| Search returns stale/mixed results   | Query cache namespacing by era                          | Low: wrong data in search results      |
| Breadcrumb capture fails             | Fire-and-forget, silent drop                            | None: invisible, never blocks dispatch |
| Router-level crash                   | Outer error boundary (last line of defense)             | Critical: rare, catches everything     |

**Threshold where architecture decision flips:** If archive zone requires its own deploy cadence, or user count exceeds ~20, or the intelligence layer needs its own build pipeline — migrate to Approach B (monorepo dual build). The route-based split is designed so this migration is straightforward: extract `archive/` into its own SPA, point at same backend.

---

## What Ships vs What Waits

| Ships Now                                  | Waits                                                 |
| ------------------------------------------ | ----------------------------------------------------- |
| Era middleware on all dispatch endpoints   | Rolling window (revisit when 2026 volume data exists) |
| `/archive` lazy route with browse + detail | Intelligence/learning engine                          |
| `Cmd+K` search overlay bridging both zones | Natural language search                               |
| Error boundaries + query cache namespacing | Archive-to-live discrepancy surfacing                 |
| CI guardrails (bundle, E2E, import lint)   | Archive-specific analysis cron jobs                   |
| Breadcrumb capture (invisible, day one)    | Breadcrumb dashboards/aggregation                     |
| One-way dependency enforcement             | Search suggestions from behavioral data               |

---

## Navigation Design

Archive is accessible but not distracting in the sidebar:

- Small "Archive" link below the main nav items, visually de-emphasized (dimmer text, no icon, or a subtle clock icon)
- Not in the primary nav group — below a divider or at the bottom
- The primary way dispatchers reach archive is through search results, not the nav link
- The nav link exists for the rare "I want to browse old loads" case

When in the archive zone, the sidebar shows a subtle visual indicator (muted background, "Archive" label) so the dispatcher knows they're in historical context. The search bar (`Cmd+K`) is always available to jump back to live.

---

## Relationship to Gap Analysis

This design directly addresses concerns from the 2026-04-03 gap analysis:

- **Gap 3 (Daily Load Count):** Live zone's reduced dataset makes daily target dashboards meaningful — 30 loads for a well, not 30 buried in 25k
- **Gap 4 (Multi-Well View):** Smaller live dataset makes multi-well views feasible without performance concerns
- **Gap 10 (Field Coverage):** Archive detail view can surface all 41 CSV fields from `rawData` without cluttering the live dispatch desk
- **Performance:** All live queries operate on a fraction of the total dataset. Archive queries are isolated and don't affect dispatch desk response times.
