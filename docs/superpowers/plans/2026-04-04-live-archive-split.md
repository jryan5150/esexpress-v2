# Live/Archive Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the ES Express v2 frontend into a focused live dispatch zone (2026+ loads) and a lazy-loaded archive zone (pre-2026), connected by a Cmd+K smart search bar, with invisible breadcrumb capture from day one.

**Architecture:** Route-based split within a single React SPA. One backend, one DB, one deploy. Archive routes are lazy-loaded with their own error boundary. A new `eraFilter` utility adds `WHERE delivered_on >= '2026-01-01'` (live) or `< '2026-01-01'` (archive) to all dispatch queries via a single middleware function. Search endpoint queries both eras and returns tagged results. Breadcrumbs capture behavioral events to a new Postgres table via fire-and-forget batched POSTs.

**Tech Stack:** React 19, React Router v7, React Query 5, Tailwind CSS 4, Fastify, Drizzle ORM, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-04-live-archive-split-design.md`

---

## File Map

### New Files

| File                                                           | Purpose                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `backend/src/plugins/dispatch/lib/era-filter.ts`               | Era filter utility — single function, used by all dispatch services |
| `backend/src/plugins/dispatch/services/search.service.ts`      | Search query across both eras                                       |
| `backend/src/plugins/dispatch/routes/search.ts`                | `GET /api/v1/dispatch/search?q=&limit=`                             |
| `backend/src/plugins/dispatch/services/breadcrumbs.service.ts` | Insert batched breadcrumb events                                    |
| `backend/src/plugins/dispatch/routes/breadcrumbs.ts`           | `POST /api/v1/dispatch/breadcrumbs`                                 |
| `backend/tests/dispatch/era-filter.test.ts`                    | Unit tests for era filter                                           |
| `backend/tests/dispatch/search.test.ts`                        | Route tests for search endpoint                                     |
| `backend/tests/dispatch/breadcrumbs.test.ts`                   | Route tests for breadcrumbs endpoint                                |
| `frontend/src/components/ErrorBoundary.tsx`                    | React error boundary with fallback UI                               |
| `frontend/src/archive/pages/ArchiveSearch.tsx`                 | Browse/filter pre-2026 loads                                        |
| `frontend/src/archive/pages/ArchiveLoadDetail.tsx`             | Single archive load detail with edit                                |
| `frontend/src/archive/hooks/use-archive.ts`                    | Archive query hooks (era: 'archive')                                |
| `frontend/src/search/SearchOverlay.tsx`                        | Cmd+K spotlight overlay component                                   |
| `frontend/src/search/useGlobalSearch.ts`                       | Search hook — calls search endpoint                                 |
| `frontend/src/search/SearchResult.tsx`                         | Single search result row component                                  |
| `frontend/src/breadcrumbs/breadcrumb-client.ts`                | Batched fire-and-forget event sender                                |
| `frontend/src/breadcrumbs/useBreadcrumb.ts`                    | React hook for tracking events                                      |
| `frontend/src/breadcrumbs/BreadcrumbProvider.tsx`              | Context provider wired into app                                     |

### Modified Files

| File                                                             | Change                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| `backend/src/db/schema.ts`                                       | Add `breadcrumbs` table definition                   |
| `backend/src/plugins/dispatch/index.ts`                          | Register search + breadcrumbs routes                 |
| `backend/src/plugins/dispatch/services/dispatch-desk.service.ts` | Accept `era` param, apply era filter                 |
| `backend/src/plugins/dispatch/routes/dispatch-desk.ts`           | Pass `era` query param to service                    |
| `backend/src/plugins/dispatch/services/loads.service.ts`         | Accept `era` param, apply era filter                 |
| `backend/src/plugins/dispatch/routes/loads.ts`                   | Pass `era` query param to service                    |
| `frontend/src/app.tsx`                                           | Add lazy archive routes with error boundary          |
| `frontend/src/components/Sidebar.tsx`                            | Add Archive nav link                                 |
| `frontend/src/components/Layout.tsx`                             | Add SearchOverlay + BreadcrumbProvider               |
| `frontend/src/lib/query-client.ts`                               | Add `search` and `archive` query keys                |
| `frontend/src/types/api.ts`                                      | Add SearchResult, ArchiveLoad, BreadcrumbEvent types |

---

## Task 1: Backend — Era Filter Utility

**Files:**

- Create: `backend/src/plugins/dispatch/lib/era-filter.ts`
- Test: `backend/tests/dispatch/era-filter.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// backend/tests/dispatch/era-filter.test.ts
import { describe, it, expect } from "vitest";
import {
  eraFilter,
  ERA_CUTOFF,
} from "../../src/plugins/dispatch/lib/era-filter.js";

describe("eraFilter", () => {
  it("returns a live filter by default when era is undefined", () => {
    const filter = eraFilter(undefined);
    expect(filter).toBeDefined();
    expect(filter.toString()).toContain(">=");
  });

  it("returns a live filter for era=live", () => {
    const filter = eraFilter("live");
    expect(filter).toBeDefined();
  });

  it("returns an archive filter for era=archive", () => {
    const filter = eraFilter("archive");
    expect(filter).toBeDefined();
  });

  it("defaults to live for invalid era values", () => {
    const filter = eraFilter("bogus" as any);
    expect(filter).toBeDefined();
  });

  it("exports the cutoff date as 2026-01-01 CST", () => {
    expect(ERA_CUTOFF.getFullYear()).toBe(2026);
    expect(ERA_CUTOFF.getMonth()).toBe(0); // January
    expect(ERA_CUTOFF.getDate()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dispatch/era-filter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the era filter**

```typescript
// backend/src/plugins/dispatch/lib/era-filter.ts
import { sql, type SQL } from "drizzle-orm";
import { loads } from "../../../db/schema.js";

export type Era = "live" | "archive";

/** 2026-01-01T00:00:00 CST (America/Chicago) */
export const ERA_CUTOFF = new Date("2026-01-01T00:00:00-06:00");

/**
 * Returns a Drizzle SQL condition that filters loads by era.
 * - 'live' (default): delivered_on >= 2026-01-01
 * - 'archive': delivered_on < 2026-01-01
 *
 * Fails closed: unknown era values default to live.
 */
export function eraFilter(era: string | undefined): SQL {
  if (era === "archive") {
    return sql`${loads.deliveredOn} < ${ERA_CUTOFF}`;
  }
  // Default to live — fail closed
  return sql`${loads.deliveredOn} >= ${ERA_CUTOFF}`;
}

/** Parse and validate era query param */
export function parseEra(value: string | undefined): Era {
  return value === "archive" ? "archive" : "live";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/dispatch/era-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/plugins/dispatch/lib/era-filter.ts backend/tests/dispatch/era-filter.test.ts
git commit -m "$(cat <<'EOF'
feat: add era filter utility for live/archive load split

Introduces eraFilter() that returns a Drizzle SQL condition:
- live (default): delivered_on >= 2026-01-01
- archive: delivered_on < 2026-01-01

Fails closed — unknown values default to live.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — Apply Era Filter to Dispatch Desk

**Files:**

- Modify: `backend/src/plugins/dispatch/services/dispatch-desk.service.ts:47-53,112-137`
- Modify: `backend/src/plugins/dispatch/routes/dispatch-desk.ts`
- Test: `backend/tests/dispatch/dispatch-desk.test.ts` (existing, add cases)

- [ ] **Step 1: Write the failing test**

Add to existing test file `backend/tests/dispatch/dispatch-desk.test.ts`:

```typescript
describe("GET /api/v1/dispatch/dispatch-desk?era=", () => {
  it("accepts era=live query param", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/dispatch-desk?era=live",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });

  it("accepts era=archive query param", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/dispatch-desk?era=archive",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });

  it("defaults to live when era is omitted", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/dispatch-desk",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dispatch/dispatch-desk.test.ts`
Expected: Tests should already pass (param is just ignored). But we need the service to actually use it — move to implementation.

- [ ] **Step 3: Update DispatchDeskFilters interface**

In `backend/src/plugins/dispatch/services/dispatch-desk.service.ts`, update the filters interface:

```typescript
// Find this interface (around line 47-53):
export interface DispatchDeskFilters {
  wellId?: number;
  photoStatus?: PhotoStatus;
  date?: string;
  page?: number;
  limit?: number;
}

// Replace with:
export interface DispatchDeskFilters {
  wellId?: number;
  photoStatus?: PhotoStatus;
  date?: string;
  era?: string;
  page?: number;
  limit?: number;
}
```

- [ ] **Step 4: Add era filter to query conditions**

In `getDispatchDeskLoads()`, after the existing date filter block (around line 137), add:

```typescript
// Find the block ending with:
//   conditions.push(sql`${loads.deliveredOn} <= ${endOfDay}`);
// }
//
// Add immediately after:
conditions.push(eraFilter(filters.era));
```

Add the import at the top of the file:

```typescript
import { eraFilter } from "../lib/era-filter.js";
```

- [ ] **Step 5: Pass era from route to service**

In `backend/src/plugins/dispatch/routes/dispatch-desk.ts`, find the GET handler that extracts query params and add `era`:

```typescript
// Find where query params are extracted (look for wellId, date, photoStatus extraction)
// Add alongside them:
const era = (request.query as Record<string, string>).era;

// Pass to service:
const result = await getDispatchDeskLoads(request.server.db, {
  wellId: wellId ? Number(wellId) : undefined,
  photoStatus: photoStatus as PhotoStatus | undefined,
  date,
  era, // ← add this
  page: page ? Number(page) : undefined,
  limit: limit ? Number(limit) : undefined,
});
```

- [ ] **Step 6: Run tests to verify everything passes**

Run: `cd backend && npx vitest run tests/dispatch/dispatch-desk.test.ts`
Expected: PASS — all existing tests still pass, new era tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/plugins/dispatch/services/dispatch-desk.service.ts backend/src/plugins/dispatch/routes/dispatch-desk.ts backend/tests/dispatch/dispatch-desk.test.ts
git commit -m "$(cat <<'EOF'
feat: apply era filter to dispatch desk endpoint

Dispatch desk now accepts ?era=live|archive query param.
Defaults to live — only 2026+ loads shown unless explicitly
requesting archive. Existing date filter works alongside era.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend — Apply Era Filter to Loads Service

**Files:**

- Modify: `backend/src/plugins/dispatch/services/loads.service.ts:14-50`
- Modify: `backend/src/plugins/dispatch/routes/loads.ts`

- [ ] **Step 1: Update LoadFilters and queryLoads**

In `backend/src/plugins/dispatch/services/loads.service.ts`, add era to filters:

```typescript
// Find the LoadFilters type/interface and add era:
// (It may be inline or a separate interface — look for the filters parameter of queryLoads)

import { eraFilter } from "../lib/era-filter.js";

// In queryLoads(), after existing condition building:
conditions.push(eraFilter(filters.era));
```

- [ ] **Step 2: Pass era from loads route**

In `backend/src/plugins/dispatch/routes/loads.ts`, extract era from query params and pass to `queryLoads`:

```typescript
const era = (request.query as Record<string, string>).era;
// Pass to queryLoads in filters
```

- [ ] **Step 3: Run existing loads tests**

Run: `cd backend && npx vitest run tests/dispatch/loads.test.ts`
Expected: PASS — existing tests still work (era defaults to live)

- [ ] **Step 4: Commit**

```bash
git add backend/src/plugins/dispatch/services/loads.service.ts backend/src/plugins/dispatch/routes/loads.ts
git commit -m "$(cat <<'EOF'
feat: apply era filter to loads endpoint

GET /dispatch/loads now accepts ?era=live|archive, defaulting to live.
Same pattern as dispatch-desk — single eraFilter() utility.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend — Breadcrumbs Schema + Migration

**Files:**

- Modify: `backend/src/db/schema.ts`
- Create: migration file via `drizzle-kit generate`

- [ ] **Step 1: Add breadcrumbs table to schema**

In `backend/src/db/schema.ts`, add after the `feedback` table definition (end of file):

```typescript
// ── Breadcrumbs (behavioral signal capture) ──────────────────────────

export const breadcrumbs = pgTable(
  "breadcrumbs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    eventData: jsonb("event_data").$type<Record<string, unknown>>().default({}),
    zone: text("zone", { enum: ["live", "archive", "search"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_breadcrumbs_event_type").on(table.eventType),
    index("idx_breadcrumbs_created_at").on(table.createdAt),
    index("idx_breadcrumbs_user_id").on(table.userId),
  ],
);
```

- [ ] **Step 2: Generate migration**

Run: `cd backend && npx drizzle-kit generate`
Expected: New migration SQL file created in migrations directory

- [ ] **Step 3: Review the generated migration**

Read the generated SQL file to verify it creates the breadcrumbs table with correct columns and indexes. It should contain:

```sql
CREATE TABLE "breadcrumbs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "event_type" text NOT NULL,
  "event_data" jsonb DEFAULT '{}'::jsonb,
  "zone" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX "idx_breadcrumbs_event_type" ON "breadcrumbs" ("event_type");
CREATE INDEX "idx_breadcrumbs_created_at" ON "breadcrumbs" ("created_at");
CREATE INDEX "idx_breadcrumbs_user_id" ON "breadcrumbs" ("user_id");
ALTER TABLE "breadcrumbs" ADD CONSTRAINT "breadcrumbs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");
```

- [ ] **Step 4: Run migration**

Run: `cd backend && npx drizzle-kit migrate`
Expected: Migration applied successfully

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.ts backend/src/db/migrations/
git commit -m "$(cat <<'EOF'
feat: add breadcrumbs table for behavioral signal capture

New table stores dispatched events: page_view, search_query,
load_expanded, field_edited, etc. Indexed on event_type,
created_at, user_id. No analysis pipeline yet — just accumulation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Backend — Breadcrumbs Endpoint

**Files:**

- Create: `backend/src/plugins/dispatch/services/breadcrumbs.service.ts`
- Create: `backend/src/plugins/dispatch/routes/breadcrumbs.ts`
- Modify: `backend/src/plugins/dispatch/index.ts`
- Test: `backend/tests/dispatch/breadcrumbs.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// backend/tests/dispatch/breadcrumbs.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  token = app.jwt.sign({
    id: 1,
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
  });
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/dispatch/breadcrumbs", () => {
  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/breadcrumbs",
      payload: { events: [] },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 202 for valid event batch", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/breadcrumbs",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          {
            eventType: "page_view",
            eventData: { page: "/dispatch-desk" },
            zone: "live",
            timestamp: new Date().toISOString(),
          },
          {
            eventType: "load_expanded",
            eventData: { loadId: 123 },
            zone: "live",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
  });

  it("returns 202 for empty events array", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/breadcrumbs",
      headers: { authorization: `Bearer ${token}` },
      payload: { events: [] },
    });
    expect(response.statusCode).toBe(202);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dispatch/breadcrumbs.test.ts`
Expected: FAIL — route not found (404)

- [ ] **Step 3: Implement the service**

```typescript
// backend/src/plugins/dispatch/services/breadcrumbs.service.ts
import type { Database } from "../../../db/client.js";
import { breadcrumbs } from "../../../db/schema.js";

export interface BreadcrumbEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  zone: "live" | "archive" | "search";
  timestamp: string;
}

export async function insertBreadcrumbs(
  db: Database,
  userId: number,
  events: BreadcrumbEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const rows = events.map((e) => ({
    userId,
    eventType: e.eventType,
    eventData: e.eventData,
    zone: e.zone,
    createdAt: new Date(e.timestamp),
  }));

  await db.insert(breadcrumbs).values(rows);
}
```

- [ ] **Step 4: Implement the route**

```typescript
// backend/src/plugins/dispatch/routes/breadcrumbs.ts
import type { FastifyPluginAsync } from "fastify";
import {
  insertBreadcrumbs,
  type BreadcrumbEvent,
} from "../services/breadcrumbs.service.js";

const breadcrumbRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { events: BreadcrumbEvent[] };
  }>(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["events"],
          properties: {
            events: {
              type: "array",
              items: {
                type: "object",
                required: ["eventType", "zone", "timestamp"],
                properties: {
                  eventType: { type: "string" },
                  eventData: { type: "object" },
                  zone: { type: "string", enum: ["live", "archive", "search"] },
                  timestamp: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { events } = request.body;
      const userId = request.user.id;

      // Fire-and-forget: don't await, don't block
      insertBreadcrumbs(request.server.db, userId, events).catch((err) => {
        request.log.warn({ err }, "breadcrumb insert failed (non-blocking)");
      });

      return reply.status(202).send();
    },
  );
};

export default breadcrumbRoutes;
```

- [ ] **Step 5: Register in dispatch plugin**

In `backend/src/plugins/dispatch/index.ts`, add:

```typescript
import breadcrumbRoutes from "./routes/breadcrumbs.js";

// Inside the plugin function, alongside existing registrations:
fastify.register(breadcrumbRoutes, { prefix: "/breadcrumbs" });
```

- [ ] **Step 6: Run tests**

Run: `cd backend && npx vitest run tests/dispatch/breadcrumbs.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/plugins/dispatch/services/breadcrumbs.service.ts backend/src/plugins/dispatch/routes/breadcrumbs.ts backend/src/plugins/dispatch/index.ts backend/tests/dispatch/breadcrumbs.test.ts
git commit -m "$(cat <<'EOF'
feat: add breadcrumbs endpoint for behavioral signal capture

POST /dispatch/breadcrumbs accepts batched events, inserts
fire-and-forget. Never blocks dispatch work. Events accumulate
for future intelligence layer placement.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Backend — Search Endpoint

**Files:**

- Create: `backend/src/plugins/dispatch/services/search.service.ts`
- Create: `backend/src/plugins/dispatch/routes/search.ts`
- Modify: `backend/src/plugins/dispatch/index.ts`
- Test: `backend/tests/dispatch/search.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// backend/tests/dispatch/search.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  token = app.jwt.sign({
    id: 1,
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
  });
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v1/dispatch/search", () => {
  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/search?q=test",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 without q param", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/search",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns live and archive arrays for valid query", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/search?q=test",
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = response.json();
      expect(body.data).toHaveProperty("live");
      expect(body.data).toHaveProperty("archive");
      expect(Array.isArray(body.data.live)).toBe(true);
      expect(Array.isArray(body.data.archive)).toBe(true);
    }
  });

  it("respects limit param", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/search?q=test&limit=5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dispatch/search.test.ts`
Expected: FAIL — route not found

- [ ] **Step 3: Implement the search service**

```typescript
// backend/src/plugins/dispatch/services/search.service.ts
import { sql, desc, and, or, type SQL } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import { loads, assignments, wells } from "../../../db/schema.js";
import { eraFilter } from "../lib/era-filter.js";

export interface SearchResult {
  id: number;
  loadNo: string;
  driverName: string | null;
  carrierName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: Date | null;
  wellName: string | null;
}

export interface SearchResponse {
  live: SearchResult[];
  archive: SearchResult[];
}

function buildSearchCondition(term: string): SQL {
  const prefix = `${term}%`;
  const contains = `%${term}%`;
  return or(
    sql`${loads.loadNo} ILIKE ${prefix}`,
    sql`${loads.bolNo} ILIKE ${prefix}`,
    sql`${loads.ticketNo} ILIKE ${prefix}`,
    sql`${loads.driverName} ILIKE ${contains}`,
    sql`${loads.carrierName} ILIKE ${contains}`,
    sql`${wells.name} ILIKE ${contains}`,
  )!;
}

async function searchEra(
  db: Database,
  term: string,
  era: "live" | "archive",
  limit: number,
): Promise<SearchResult[]> {
  const rows = await db
    .select({
      id: loads.id,
      loadNo: loads.loadNo,
      driverName: loads.driverName,
      carrierName: loads.carrierName,
      bolNo: loads.bolNo,
      ticketNo: loads.ticketNo,
      deliveredOn: loads.deliveredOn,
      wellName: wells.name,
    })
    .from(loads)
    .leftJoin(assignments, sql`${assignments.loadId} = ${loads.id}`)
    .leftJoin(wells, sql`${wells.id} = ${assignments.wellId}`)
    .where(and(eraFilter(era), buildSearchCondition(term)))
    .orderBy(desc(loads.deliveredOn))
    .limit(limit);

  return rows;
}

export async function searchLoads(
  db: Database,
  term: string,
  limit = 10,
): Promise<SearchResponse> {
  const [live, archive] = await Promise.all([
    searchEra(db, term, "live", limit),
    searchEra(db, term, "archive", limit),
  ]);

  return { live, archive };
}
```

- [ ] **Step 4: Implement the route**

```typescript
// backend/src/plugins/dispatch/routes/search.ts
import type { FastifyPluginAsync } from "fastify";
import { searchLoads } from "../services/search.service.js";

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q?: string; limit?: string };
  }>(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 1 },
            limit: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { q, limit } = request.query as { q: string; limit?: string };
      const parsedLimit = limit ? Math.min(Number(limit), 20) : 10;
      const results = await searchLoads(request.server.db, q, parsedLimit);
      return reply.send({ data: results });
    },
  );
};

export default searchRoutes;
```

- [ ] **Step 5: Register in dispatch plugin**

In `backend/src/plugins/dispatch/index.ts`, add:

```typescript
import searchRoutes from "./routes/search.js";

// Inside the plugin function:
fastify.register(searchRoutes, { prefix: "/search" });
```

- [ ] **Step 6: Run tests**

Run: `cd backend && npx vitest run tests/dispatch/search.test.ts`
Expected: PASS

- [ ] **Step 7: Run all backend tests**

Run: `cd backend && npx vitest run`
Expected: All tests pass — era filter defaults to live, no regressions

- [ ] **Step 8: Commit**

```bash
git add backend/src/plugins/dispatch/services/search.service.ts backend/src/plugins/dispatch/routes/search.ts backend/src/plugins/dispatch/index.ts backend/tests/dispatch/search.test.ts
git commit -m "$(cat <<'EOF'
feat: add search endpoint querying both live and archive eras

GET /dispatch/search?q=<term>&limit=10 searches loadNo, bolNo,
ticketNo (prefix match) and driverName, carrierName, wellName
(contains match) across both eras in parallel. Returns tagged
{ live: [], archive: [] } results.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — ErrorBoundary Component

**Files:**

- Create: `frontend/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Create the ErrorBoundary**

```tsx
// frontend/src/components/ErrorBoundary.tsx
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-2">
              <p className="text-on-surface font-headline text-lg">
                Something went wrong
              </p>
              <p className="text-on-surface-variant text-sm">
                Try refreshing the page
              </p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="mt-3 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-container transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ErrorBoundary.tsx
git commit -m "$(cat <<'EOF'
feat: add React ErrorBoundary component

Catches rendering errors in child tree, shows fallback UI with
retry button. Accepts custom fallback prop for zone-specific
messages (e.g., archive unavailable).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — Types + Query Keys for Archive & Search

**Files:**

- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/lib/query-client.ts`

- [ ] **Step 1: Add types**

In `frontend/src/types/api.ts`, add at the end of the file:

```typescript
// ── Search ──────────────────────────────────────────────
export interface SearchResult {
  id: number;
  loadNo: string;
  driverName: string | null;
  carrierName: string | null;
  bolNo: string | null;
  ticketNo: string | null;
  deliveredOn: string | null;
  wellName: string | null;
}

export interface SearchResponse {
  live: SearchResult[];
  archive: SearchResult[];
}

// ── Breadcrumbs ─────────────────────────────────────────
export type BreadcrumbZone = "live" | "archive" | "search";

export interface BreadcrumbEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  zone: BreadcrumbZone;
  timestamp: string;
}
```

- [ ] **Step 2: Add query keys**

In `frontend/src/lib/query-client.ts`, add to the `qk` object:

```typescript
search: {
  all: ['search'] as const,
  query: (q: string) => ['search', q] as const,
},
archive: {
  all: ['archive'] as const,
  loads: (filters?: Record<string, unknown>) =>
    [...(['archive', 'loads'] as const), filters] as const,
  load: (id: number) => ['archive', 'load', id] as const,
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/lib/query-client.ts
git commit -m "$(cat <<'EOF'
feat: add TypeScript types and query keys for search + archive

SearchResult, SearchResponse, BreadcrumbEvent types.
qk.search.query() and qk.archive.loads() query key factories.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend — Archive Hooks

**Files:**

- Create: `frontend/src/archive/hooks/use-archive.ts`

- [ ] **Step 1: Create the archive hooks**

```typescript
// frontend/src/archive/hooks/use-archive.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/query-client";
import type { DispatchDeskLoad, Paginated } from "../../types/api";

export function useArchiveLoads(filters?: {
  wellId?: number;
  date?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set("era", "archive");
  if (filters?.wellId) params.set("wellId", String(filters.wellId));
  if (filters?.date) params.set("date", filters.date);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: qk.archive.loads(filters),
    queryFn: () =>
      api.get<Paginated<DispatchDeskLoad>>(`/dispatch/dispatch-desk?${qs}`),
  });
}

export function useArchiveLoad(id: number) {
  return useQuery({
    queryKey: qk.archive.load(id),
    queryFn: () =>
      api.get<DispatchDeskLoad>(`/dispatch/loads/${id}?era=archive`),
    enabled: id > 0,
  });
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p frontend/src/archive/hooks && git add frontend/src/archive/hooks/use-archive.ts
git commit -m "$(cat <<'EOF'
feat: add archive query hooks with era=archive param

useArchiveLoads() and useArchiveLoad() use the same dispatch-desk
and loads endpoints with era=archive. Query keys namespaced under
qk.archive to prevent cache cross-pollution with live queries.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend — Archive Pages

**Files:**

- Create: `frontend/src/archive/pages/ArchiveSearch.tsx`
- Create: `frontend/src/archive/pages/ArchiveLoadDetail.tsx`

- [ ] **Step 1: Create ArchiveSearch page**

```tsx
// frontend/src/archive/pages/ArchiveSearch.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useArchiveLoads } from "../hooks/use-archive";
import { Pagination } from "../../components/Pagination";

export function ArchiveSearch() {
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState("");
  const loadsQuery = useArchiveLoads({
    page,
    limit: 50,
    date: dateFilter || undefined,
  });

  const loads = loadsQuery.data?.items ?? [];
  const totalPages = loadsQuery.data?.totalPages ?? 1;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-xl font-bold text-on-surface">
            Archive
          </h1>
          <p className="text-sm text-on-surface-variant">
            Loads before January 2026
          </p>
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          className="bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-sm text-on-surface"
        />
      </div>

      {/* Load list */}
      <div className="flex-1 overflow-y-auto rounded-xl bg-surface-container-lowest border border-outline-variant/30">
        {loadsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : loads.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant text-sm">
            No archived loads found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low/50 text-on-surface-variant text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Load #</th>
                <th className="text-left px-4 py-2.5">Driver</th>
                <th className="text-left px-4 py-2.5">Carrier</th>
                <th className="text-left px-4 py-2.5">Well</th>
                <th className="text-left px-4 py-2.5">BOL</th>
                <th className="text-left px-4 py-2.5">Delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {loads.map((load) => (
                <tr
                  key={load.loadId}
                  className="hover:bg-surface-container-low/30 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/archive/load/${load.loadId}`}
                      className="text-primary hover:underline font-label"
                    >
                      {load.loadNo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-on-surface">
                    {load.driverName ?? "--"}
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">
                    {load.carrierName ?? "--"}
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">
                    {load.wellName ?? "--"}
                  </td>
                  <td className="px-4 py-2.5 font-label text-on-surface-variant">
                    {load.bolNo ?? "--"}
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant">
                    {load.deliveredOn
                      ? new Date(load.deliveredOn).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ArchiveLoadDetail page**

```tsx
// frontend/src/archive/pages/ArchiveLoadDetail.tsx
import { useParams, Link } from "react-router-dom";
import { useArchiveLoad } from "../hooks/use-archive";

export function ArchiveLoadDetail() {
  const { id } = useParams<{ id: string }>();
  const loadQuery = useArchiveLoad(Number(id));
  const load = loadQuery.data;

  if (loadQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!load) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-on-surface-variant">Load not found</p>
      </div>
    );
  }

  const fields = [
    ["Load #", load.loadNo],
    ["Driver", load.driverName],
    ["Truck", load.truckNo],
    ["Carrier", load.carrierName],
    ["Well", load.wellName],
    ["Product", load.productDescription],
    ["Weight (tons)", load.weightTons],
    ["BOL #", load.bolNo],
    ["Ticket #", load.ticketNo],
    [
      "Delivered",
      load.deliveredOn
        ? new Date(load.deliveredOn).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
    ],
  ] as const;

  return (
    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
      {/* Breadcrumb nav */}
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link to="/archive" className="hover:text-primary transition-colors">
          Archive
        </Link>
        <span>/</span>
        <span className="text-on-surface font-medium">Load #{load.loadNo}</span>
      </div>

      {/* Archive indicator */}
      <div className="px-3 py-1.5 bg-[#fef3c7] text-[#92400e] text-xs font-medium rounded-lg inline-block">
        Archived — pre-2026 load
      </div>

      {/* Fields */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6">
        <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
          Load Details
        </h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wide">
                {label}
              </dt>
              <dd className="text-sm text-on-surface font-medium mt-0.5">
                {value ?? "--"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p frontend/src/archive/pages && git add frontend/src/archive/pages/ArchiveSearch.tsx frontend/src/archive/pages/ArchiveLoadDetail.tsx
git commit -m "$(cat <<'EOF'
feat: add archive pages — ArchiveSearch + ArchiveLoadDetail

ArchiveSearch: table view of pre-2026 loads with date filter and
pagination. ArchiveLoadDetail: read-only detail view with archive
indicator badge. Both use era=archive query hooks.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Frontend — Route Registration + Sidebar

**Files:**

- Modify: `frontend/src/app.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add archive routes to app.tsx**

At the top of `frontend/src/app.tsx`, add lazy imports:

```typescript
const ArchiveSearch = lazy(() =>
  import("./archive/pages/ArchiveSearch").then((m) => ({
    default: m.ArchiveSearch,
  })),
);
const ArchiveLoadDetail = lazy(() =>
  import("./archive/pages/ArchiveLoadDetail").then((m) => ({
    default: m.ArchiveLoadDetail,
  })),
);
```

Add the import for ErrorBoundary:

```typescript
import { ErrorBoundary } from "./components/ErrorBoundary";
```

Inside the `<Route element={<Layout />}>` block, add archive routes after the existing routes:

```tsx
{
  /* Archive zone — lazy loaded, error-bounded */
}
<Route
  path="archive"
  element={
    <ErrorBoundary
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <p className="text-on-surface font-headline text-lg">
              Archive temporarily unavailable
            </p>
            <p className="text-on-surface-variant text-sm">
              Use Ctrl+K search to find specific loads
            </p>
          </div>
        </div>
      }
    >
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  }
>
  <Route index element={<ArchiveSearch />} />
  <Route path="load/:id" element={<ArchiveLoadDetail />} />
</Route>;
```

Note: You'll need to import `Outlet` and `Suspense`:

```typescript
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
```

- [ ] **Step 2: Add archive link to Sidebar**

In `frontend/src/components/Sidebar.tsx`, find the Operations section (the one containing Finance) and add an Archive section below it:

```tsx
{
  /* After the Operations section */
}
<div className="mt-3">
  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-outline/60">
    Reference
  </div>
  <Link
    to="/archive"
    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
      isActive("/archive")
        ? "bg-[#ede9f8] text-primary font-semibold"
        : "text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface-variant"
    }`}
  >
    <span
      className="material-symbols-outlined text-[18px]"
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
    >
      inventory_2
    </span>
    Archive
  </Link>
</div>;
```

Note: The nav class uses the same `isActive()` pattern already in Sidebar.tsx. The icon `inventory_2` is from Material Symbols (already loaded). The link is intentionally dimmer (`text-on-surface-variant/60`) to de-emphasize it.

- [ ] **Step 3: Verify the routes load**

Run: `cd frontend && npx vite build`
Expected: Build succeeds with archive chunk in output

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.tsx frontend/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat: register archive routes with error boundary + sidebar link

Archive routes lazy-loaded under /archive with dedicated error
boundary. Sidebar shows "Archive" in de-emphasized "Reference"
section below main nav. Archive chunk only loads when visited.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Frontend — Search Overlay

**Files:**

- Create: `frontend/src/search/SearchOverlay.tsx`
- Create: `frontend/src/search/useGlobalSearch.ts`
- Create: `frontend/src/search/SearchResult.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Create the search hook**

```typescript
// frontend/src/search/useGlobalSearch.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/query-client";
import type { SearchResponse } from "../types/api";

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: qk.search.query(query),
    queryFn: () =>
      api.get<SearchResponse>(
        `/dispatch/search?q=${encodeURIComponent(query)}&limit=10`,
      ),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });
}
```

- [ ] **Step 2: Create SearchResult component**

```tsx
// frontend/src/search/SearchResult.tsx
import { Link } from "react-router-dom";
import type { SearchResult as SearchResultType } from "../types/api";

interface SearchResultProps {
  result: SearchResultType;
  era: "live" | "archive";
  onClick: () => void;
}

export function SearchResult({ result, era, onClick }: SearchResultProps) {
  const to =
    era === "live"
      ? `/dispatch-desk?loadId=${result.id}`
      : `/archive/load/${result.id}`;

  const dateStr = result.deliveredOn
    ? new Date(result.deliveredOn).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      })
    : "";

  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low/50 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-label text-sm text-on-surface font-medium">
            #{result.loadNo}
          </span>
          {result.driverName && (
            <span className="text-sm text-on-surface-variant truncate">
              {result.driverName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant/70 mt-0.5">
          {result.wellName && <span>{result.wellName}</span>}
          {result.bolNo && <span>BOL {result.bolNo}</span>}
        </div>
      </div>
      {dateStr && (
        <span className="text-xs text-on-surface-variant/50 shrink-0">
          {dateStr}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 3: Create SearchOverlay component**

```tsx
// frontend/src/search/SearchOverlay.tsx
import { useState, useEffect, useRef } from "react";
import { useGlobalSearch } from "./useGlobalSearch";
import { SearchResult } from "./SearchResult";

export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useGlobalSearch(query);
  const results = searchQuery.data;

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
      ) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const hasLive = (results?.live.length ?? 0) > 0;
  const hasArchive = (results?.archive.length ?? 0) > 0;
  const hasResults = hasLive || hasArchive;
  const noResults = query.length >= 2 && !searchQuery.isLoading && !hasResults;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 animate-slide-down">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-xl overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/20">
            <span className="material-symbols-outlined text-on-surface-variant text-xl">
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search loads, BOLs, drivers..."
              className="flex-1 bg-transparent text-on-surface placeholder:text-on-surface-variant/40 text-sm outline-none"
            />
            <kbd className="text-[10px] text-on-surface-variant/40 bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/20">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto">
            {searchQuery.isLoading && query.length >= 2 && (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}

            {noResults && (
              <div className="text-center py-6 text-sm text-on-surface-variant">
                No loads found for "{query}"
              </div>
            )}

            {hasLive && (
              <div>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant/50 bg-surface-container-low/30">
                  Current Loads
                </div>
                {results!.live.map((r) => (
                  <SearchResult
                    key={`live-${r.id}`}
                    result={r}
                    era="live"
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            )}

            {hasArchive && (
              <div>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant/50 bg-surface-container-low/30">
                  {!hasLive && query.length >= 2
                    ? "No current loads found · showing archive"
                    : "Archive"}
                </div>
                {results!.archive.map((r) => (
                  <SearchResult
                    key={`archive-${r.id}`}
                    result={r}
                    era="archive"
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {query.length < 2 && (
            <div className="px-4 py-2.5 text-xs text-on-surface-variant/40 border-t border-outline-variant/10">
              Type at least 2 characters to search
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Wire SearchOverlay into Layout**

In `frontend/src/components/Layout.tsx`, add the SearchOverlay inside the layout:

```typescript
import { SearchOverlay } from "../search/SearchOverlay";
```

Inside the component's return JSX, add `<SearchOverlay />` as a sibling of the main content area (before the closing `</div>` of the flex container):

```tsx
<div className="flex h-screen overflow-hidden">
  <Sidebar />
  <div className="flex-1 flex flex-col h-screen min-w-0">
    {/* ... header ... */}
    <main className="flex-1 min-h-0 overflow-hidden">
      <Outlet />
    </main>
  </div>
  <FeedbackWidget />
  <SearchOverlay />
</div>
```

- [ ] **Step 5: Verify the build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
mkdir -p frontend/src/search && git add frontend/src/search/SearchOverlay.tsx frontend/src/search/useGlobalSearch.ts frontend/src/search/SearchResult.tsx frontend/src/components/Layout.tsx
git commit -m "$(cat <<'EOF'
feat: add Cmd+K smart search overlay bridging live and archive

SearchOverlay triggered by Ctrl+K, Cmd+K, or / key. Queries
both eras in parallel, groups results as "Current Loads" and
"Archive" with appropriate context messaging. Clicking a result
navigates to dispatch desk (live) or archive detail (archive).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Frontend — Breadcrumb Capture

**Files:**

- Create: `frontend/src/breadcrumbs/breadcrumb-client.ts`
- Create: `frontend/src/breadcrumbs/useBreadcrumb.ts`
- Create: `frontend/src/breadcrumbs/BreadcrumbProvider.tsx`
- Modify: `frontend/src/app.tsx`

- [ ] **Step 1: Create the breadcrumb client (batched sender)**

```typescript
// frontend/src/breadcrumbs/breadcrumb-client.ts
import type { BreadcrumbEvent, BreadcrumbZone } from "../types/api";

const FLUSH_INTERVAL = 30_000; // 30 seconds
const BASE = (import.meta.env.VITE_API_URL || "") + "/api/v1";

let buffer: BreadcrumbEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function flush() {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];

  const token = localStorage.getItem("esexpress-token");
  if (!token) return;

  // Fire-and-forget — errors are silently ignored
  fetch(`${BASE}/dispatch/breadcrumbs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ events }),
    keepalive: true, // survives page unload
  }).catch(() => {});
}

export function track(
  eventType: string,
  eventData: Record<string, unknown>,
  zone: BreadcrumbZone,
) {
  buffer.push({
    eventType,
    eventData,
    zone,
    timestamp: new Date().toISOString(),
  });
}

export function startCapture() {
  if (timer) return;
  timer = setInterval(flush, FLUSH_INTERVAL);
  window.addEventListener("beforeunload", flush);
}

export function stopCapture() {
  flush();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  window.removeEventListener("beforeunload", flush);
}
```

- [ ] **Step 2: Create the useBreadcrumb hook**

```typescript
// frontend/src/breadcrumbs/useBreadcrumb.ts
import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { track } from "./breadcrumb-client";
import type { BreadcrumbZone } from "../types/api";

function inferZone(pathname: string): BreadcrumbZone {
  if (pathname.startsWith("/archive")) return "archive";
  return "live";
}

export function useBreadcrumb() {
  const location = useLocation();

  const trackEvent = useCallback(
    (
      eventType: string,
      eventData: Record<string, unknown> = {},
      zone?: BreadcrumbZone,
    ) => {
      track(eventType, eventData, zone ?? inferZone(location.pathname));
    },
    [location.pathname],
  );

  return { track: trackEvent };
}
```

- [ ] **Step 3: Create BreadcrumbProvider**

```tsx
// frontend/src/breadcrumbs/BreadcrumbProvider.tsx
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { startCapture, stopCapture, track } from "./breadcrumb-client";

export function BreadcrumbProvider() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  // Start/stop capture on mount/unmount
  useEffect(() => {
    startCapture();
    return () => stopCapture();
  }, []);

  // Track page views on route changes
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      const zone = location.pathname.startsWith("/archive")
        ? ("archive" as const)
        : ("live" as const);
      track("page_view", { page: location.pathname }, zone);
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

  return null; // Invisible — no UI
}
```

- [ ] **Step 4: Wire BreadcrumbProvider into app.tsx**

In `frontend/src/app.tsx`, import and add the provider inside the BrowserRouter (so it has access to routing context), but outside the Routes:

```typescript
import { BreadcrumbProvider } from "./breadcrumbs/BreadcrumbProvider";
```

Add inside the `<BrowserRouter>`, before or after `<Suspense>`:

```tsx
<BrowserRouter>
  <BreadcrumbProvider />
  <Suspense fallback={<PageLoader />}>
    <Routes>{/* ... */}</Routes>
  </Suspense>
</BrowserRouter>
```

- [ ] **Step 5: Verify the build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
mkdir -p frontend/src/breadcrumbs && git add frontend/src/breadcrumbs/breadcrumb-client.ts frontend/src/breadcrumbs/useBreadcrumb.ts frontend/src/breadcrumbs/BreadcrumbProvider.tsx frontend/src/app.tsx
git commit -m "$(cat <<'EOF'
feat: add invisible breadcrumb capture from day one

BreadcrumbProvider auto-tracks page views on route changes.
useBreadcrumb() hook available for components to track specific
events (load_expanded, field_edited, search_query, etc.).
Events batch in memory, flush every 30s via fire-and-forget POST.
Silently drops on failure — never blocks dispatch work.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Wire Breadcrumb Events into Key Interactions

**Files:**

- Modify: `frontend/src/pages/DispatchDesk.tsx`
- Modify: `frontend/src/search/SearchOverlay.tsx`

- [ ] **Step 1: Add breadcrumb tracking to DispatchDesk**

In `frontend/src/pages/DispatchDesk.tsx`, import the hook:

```typescript
import { useBreadcrumb } from "../breadcrumbs/useBreadcrumb";
```

Inside the component, initialize:

```typescript
const { track } = useBreadcrumb();
```

Add tracking calls to existing event handlers (don't change behavior, just add `track()` calls):

```typescript
// When a load is expanded (find the expandedLoadId setter):
// After: setExpandedLoadId(loadId)
track("load_expanded", { loadId });

// When filter changes (find setActiveFilter):
// After: setActiveFilter(filter)
track("filter_changed", { filterType: "status", value: filter });

// When date filter changes:
// After: setDateFilter(e.target.value)
track("filter_changed", { filterType: "date", value: e.target.value });

// When bulk action occurs (find handleApproveAll, handleMarkAll, handleBulkValidate):
// After bulk action:
track("bulk_action", { action: "approve_all", count: pendingLoads.length });
track("bulk_action", { action: "mark_entered", count: readyLoads.length });
track("bulk_action", { action: "bulk_validate", count: selectedIds.size });
```

- [ ] **Step 2: Add breadcrumb tracking to SearchOverlay**

In `frontend/src/search/SearchOverlay.tsx`, import track directly:

```typescript
import { track as trackBreadcrumb } from "../breadcrumbs/breadcrumb-client";
```

Add tracking when search executes (after results return) and when a result is clicked:

```typescript
// In the SearchResult onClick handler (already passed as prop):
// Wrap the setOpen(false) call:
onClick={() => {
  trackBreadcrumb('search_result_click', {
    resultEra: era,
    loadNo: r.loadNo,
    position: index,
  }, 'search');
  setOpen(false);
}}

// When query changes and results arrive, track the search:
// Add a useEffect that fires when results change:
useEffect(() => {
  if (query.length >= 2 && results) {
    trackBreadcrumb('search_query', {
      query,
      liveResultCount: results.live.length,
      archiveResultCount: results.archive.length,
    }, 'search');
  }
}, [results]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DispatchDesk.tsx frontend/src/search/SearchOverlay.tsx
git commit -m "$(cat <<'EOF'
feat: wire breadcrumb events into dispatch desk and search

Tracks: load_expanded, filter_changed, bulk_action in dispatch
desk. Tracks: search_query, search_result_click in search overlay.
All fire-and-forget via breadcrumb client — zero UI impact.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Update Live Dispatch Desk to Default to era=live

**Files:**

- Modify: `frontend/src/hooks/use-wells.ts`

- [ ] **Step 1: Add era=live to useDispatchDeskLoads**

In `frontend/src/hooks/use-wells.ts`, find the `useDispatchDeskLoads` function and add `era=live` to the query params:

```typescript
// Find the URLSearchParams construction in useDispatchDeskLoads
// Add this line after the existing params:
params.set("era", "live");
```

This ensures the live dispatch desk only shows 2026+ loads even without the backend middleware change being deployed yet.

- [ ] **Step 2: Verify existing behavior**

Run: `cd frontend && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-wells.ts
git commit -m "$(cat <<'EOF'
feat: dispatch desk explicitly requests era=live

Ensures live dispatch desk only shows 2026+ loads. Belt-and-
suspenders with backend default — frontend sends era=live,
backend defaults to live if omitted.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds. Check output for:

- Main chunk under 500KB
- Separate archive chunk
- Separate search chunk

- [ ] **Step 3: Verify archive chunk is lazy-loaded**

In the Vite build output, look for a separate chunk containing `ArchiveSearch` and `ArchiveLoadDetail`. This confirms the archive code is not in the main bundle.

- [ ] **Step 4: Verify import direction rule**

Run: `cd frontend && grep -r "from.*archive" src/pages/ src/components/ src/hooks/ src/lib/ 2>/dev/null`
Expected: No results — live code does not import from archive

- [ ] **Step 5: Final commit if any cleanup needed**

If any linting or formatting issues were found, fix and commit.
