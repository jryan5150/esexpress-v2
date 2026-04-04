# ES Express v2

Dispatch operations platform for ES Express LLC. Replaces a manual workflow spanning PCS Software, Google Sheets, JotForm, PropX, and LogistiqIQ with a unified web application.

## Architecture

```
frontend/          React 19 + Tailwind v4 + React Query
backend/           Fastify 5 + Drizzle ORM + PostgreSQL
health-dashboard/  Feedback widget analytics (standalone)
```

**Monorepo** managed with pnpm workspaces. Backend and frontend deploy independently.

## Quick Start

```bash
# Prerequisites: Node >= 20, pnpm
cp .env.example .env   # Fill in DATABASE_URL, API keys

# Install
pnpm install

# Database
cd backend
pnpm db:push           # Push schema to PostgreSQL

# Run
pnpm dev               # Backend on :3000
cd ../frontend && pnpm dev  # Frontend on :5173
```

## Environment Variables

| Variable           | Required     | Description                  |
| ------------------ | ------------ | ---------------------------- |
| `DATABASE_URL`     | Yes          | PostgreSQL connection string |
| `JWT_SECRET`       | Yes          | Min 32 chars for auth tokens |
| `PORT`             | No           | Backend port (default: 3000) |
| `PROPX_API_KEY`    | For sync     | PropX load data ingestion    |
| `LOGISTIQ_API_KEY` | For sync     | LogistiqIQ carrier data      |
| `PCS_ACCESS_KEY`   | For dispatch | PCS Software SOAP bridge     |
| `JOTFORM_API_KEY`  | For photos   | Weight ticket photo import   |
| `GOOGLE_CLIENT_ID` | For SSO      | Google OAuth login           |

See `.env.example` for the full list.

## Backend

### API Routes

| Prefix                 | Plugin       | Purpose                                                        |
| ---------------------- | ------------ | -------------------------------------------------------------- |
| `/api/v1/auth`         | Auth         | Login, JWT, SSO, user management                               |
| `/api/v1/dispatch`     | Dispatch     | Wells, loads, assignments, dispatch desk, validation, presence |
| `/api/v1/ingestion`    | Ingestion    | PropX and LogistiqIQ data sync                                 |
| `/api/v1/pcs`          | PCS          | SOAP bridge to PCS Software                                    |
| `/api/v1/verification` | Verification | Photo matching, JotForm imports, BOL reconciliation            |
| `/api/v1/finance`      | Finance      | Payment batches, driver settlements                            |
| `/api/v1/sheets`       | Sheets       | Google Sheets import/export                                    |
| `/api/v1/diag`         | Diagnostics  | System health (no auth)                                        |
| `/api/v1/feedback`     | Feedback     | User feedback collection                                       |

### Database Schema (22 tables)

**Core:** `users`, `wells`, `loads`, `assignments`
**Verification:** `photos`, `jotform_imports`, `bol_submissions`
**Ingestion:** `sync_runs`, `propx_jobs`, `propx_drivers`, `ingestion_conflicts`
**Mapping:** `location_mappings`, `customer_mappings`, `product_mappings`, `driver_crossrefs`
**Finance:** `payment_batches`, `payment_batch_loads`
**Auth:** `sso_config`, `invited_emails`
**System:** `pcs_sessions`, `feedback`, `breadcrumbs`

### Assignment State Machine

```
pending -> assigned -> reconciled -> dispatch_ready -> dispatching -> dispatched
                  \-> dispatch_ready  (skip reconcile)     |
                                                           v
                                                      in_transit -> at_terminal -> loaded
                                                           |                        |
                                                           v                        v
                                                      at_destination -------> delivered -> completed

failed -> dispatch_ready | cancelled
cancelled -> pending
```

Reconciliation is optional -- loads can skip from `assigned` directly to `dispatch_ready` when BOL verification isn't needed.

### Scheduled Jobs

All times US Central (America/Chicago):

| Time                | Job                      | Scope           |
| ------------------- | ------------------------ | --------------- |
| 4:00 AM             | PropX sync               | Last 7 days     |
| 4:15 AM             | Logistiq sync            | Last 7 days     |
| 4:30 AM             | Auto-map                 | Unmatched loads |
| 8am, 12pm, 4pm, 8pm | PropX + Logistiq refresh | Last 2 days     |

## Frontend

### Pages

| Route         | Component     | Purpose                                                           |
| ------------- | ------------- | ----------------------------------------------------------------- |
| `/`           | DispatchDesk  | Primary dispatcher workspace -- load management, batch operations |
| `/validation` | Validation    | Review and approve auto-mapped load-to-well assignments           |
| `/bol-queue`  | BolQueue      | BOL reconciliation, JotForm submissions, missing tickets          |
| `/finance`    | Finance       | Payment batch management, driver settlements                      |
| `/exceptions` | ExceptionFeed | Unresolved loads, mapping conflicts                               |
| `/wells`      | WellWorkspace | Well configuration and management                                 |
| `/settings`   | Settings      | User preferences                                                  |
| `/login`      | Login         | Authentication                                                    |

### Key Components

| Component      | Description                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoadRow`      | 9-column grid row with status badge, copy actions, color-coded assignee border                                                                 |
| `ExpandDrawer` | Inline expansion with photo viewer, editable fields, timeline, financial detail, BOL verification, load calculator, duplicate/copy-all actions |
| `PhotoModal`   | Full-screen BOL/ticket photo viewer with editable info panel                                                                                   |
| `WellPicker`   | Fuzzy-search well assignment with suggestions and create-new                                                                                   |
| `Sidebar`      | Navigation with presence indicators                                                                                                            |
| `Pagination`   | Paginated result navigation                                                                                                                    |

### Dispatch Desk Features

- **Multi-well tabs** -- pin wells and switch between them without losing context
- **Today's Objectives** -- aggregate progress bar showing loads built vs daily targets
- **Per-well progress** -- individual target bars on the well picker cards
- **Smart Date Batch** -- select loads, pick a date, apply to all at once
- **Bulk Validate** -- Shift+V to validate all selected loads
- **Color-coded assignments** -- dispatcher colors (hex) on load row borders and badges
- **Claim button** -- one-click self-assignment for unclaimed loads
- **Per-field copy** -- copy icon on every editable field, plus "Copy All Fields" for PCS paste
- **BOL verification** -- last-4 digit match badge comparing load BOL vs JotForm submission
- **Load calculator** -- auto-computes Rate x Weight, $/mile, and estimated total with FSC
- **Keyboard shortcuts** -- Shift+A (approve all), Shift+E (mark entered), Shift+V (validate), Esc (clear)

### Stack

- **React 19** with React Router 7
- **Tailwind CSS v4** with custom design tokens (Material Design 3 inspired)
- **TanStack React Query** for server state
- **Vite 6** for build and dev server
- **Code-split lazy routes** -- main chunk under 510KB

## Data Flow

```
PropX API ──> Ingestion ──> loads table ──> Auto-Map ──> assignments table
                                                              |
LogistiqIQ ─────────────────────────────┘                     v
                                                    Dispatch Desk (UI)
JotForm ──> Verification ──> jotform_imports ──> Photo Match  |
                                                              v
                                                    PCS Software (SOAP)
```

1. **Ingestion** pulls loads from PropX and LogistiqIQ on schedule
2. **Auto-Map** matches loads to wells using location/driver/product mappings
3. **Dispatchers** review, validate, edit, and batch-process via the Dispatch Desk
4. **Verification** matches JotForm weight ticket photos to loads
5. **Dispatch** sends finalized loads to PCS Software via SOAP bridge
6. **Finance** tracks payment batches and driver settlements

## Development

```bash
# Backend dev (hot reload)
cd backend && pnpm dev

# Frontend dev (Vite HMR)
cd frontend && pnpm dev

# Database migrations
cd backend
pnpm db:generate    # Generate migration from schema changes
pnpm db:push        # Push schema directly (dev only)
pnpm db:studio      # Drizzle Studio GUI

# Tests
pnpm test           # Backend tests
pnpm test:frontend  # Frontend tests

# Build
pnpm build          # Both backend and frontend
```

### Key Conventions

- **Feature-based organization** -- backend plugins are self-contained with routes, services, and lib
- **Consistent response envelope** -- `{ success, data, error, meta }`
- **Transactional writes** -- multi-insert operations wrapped in `db.transaction()`
- **ISO strings in SQL** -- never pass `Date` objects into Drizzle `sql` templates (postgres.js with `prepare: false` requires strings)
- **Schema-validated routes** -- all Fastify query/body params declared in route schemas (undeclared params get stripped)

## Deployment

**Backend:** Railway (PostgreSQL + Node.js service)
**Frontend:** Vercel (static site from `frontend/dist`)

Production: `app.esexpressllc.com`

## License

Proprietary -- Lexcom Systems Group Inc. / ES Express LLC
