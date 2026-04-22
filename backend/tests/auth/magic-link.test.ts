/**
 * Magic-link auth flow tests
 * ==========================
 *
 * These are unit-ish tests that mock the notifications.sendEmail side effect
 * (so we don't actually hit Graph) and use an in-memory stub of the db
 * client with the minimal query surface the routes rely on.
 *
 * Coverage:
 *   1. Happy path: request → email sent → verify → redirect with JWT
 *   2. Expired token: verify returns error redirect
 *   3. Reused token: second verify returns used-redirect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ────────────────────────────────────────────────────────────────
// Mock the db client module BEFORE importing app. We provide an
// in-memory stub that supports the query shapes magic-link uses.
// ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface Store {
  users: Row[];
  magic_link_tokens: Row[];
  notification_events: Row[];
}

const store: Store = {
  users: [],
  magic_link_tokens: [],
  notification_events: [],
};

let nextTokenId = 1;
let nextEventId = 1;

function resetStore(): void {
  store.users = [
    {
      id: 1,
      email: "user@example.com",
      name: "Example User",
      role: "admin",
      passwordHash: null,
      lastLoginAt: null,
    },
  ];
  store.magic_link_tokens = [];
  store.notification_events = [];
  nextTokenId = 1;
  nextEventId = 1;
}

/**
 * Tiny stub query builder that emulates just enough of drizzle's chain-call
 * fluent API to satisfy the magic-link routes. NOT a general solution —
 * intentionally matches the exact query shapes used in magic-link.ts.
 */
function makeStubDb() {
  return {
    select(cols?: Record<string, unknown>) {
      const _cols = cols;
      const query: {
        _table?: keyof Store;
        _where?: (row: Row) => boolean;
      } = {};
      const chain = {
        from(tableRef: unknown) {
          // Drizzle tables carry a Symbol-keyed tableName; we tag our stub
          // tables at call sites via a proxy. Easier: pass the tableName
          // string via the @@__tableName meta set when building schema refs.
          const name = (tableRef as { _tableName?: keyof Store })._tableName;
          if (!name) throw new Error("stub: unknown table");
          query._table = name;
          return chain;
        },
        where(predicate: (row: Row) => boolean) {
          query._where = predicate;
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit(_n: number) {
          return chain;
        },
        async then(resolve: (v: Row[]) => void) {
          const table = store[query._table!];
          const rows = query._where ? table.filter(query._where) : [...table];
          const projected = _cols
            ? rows.map((r) => {
                const out: Row = {};
                for (const key of Object.keys(_cols)) {
                  const col = _cols[key] as { _columnName?: string };
                  const colName = col._columnName ?? key;
                  out[key] = r[colName];
                }
                return out;
              })
            : rows;
          resolve(projected);
        },
        // Allow `await` directly on this chain AS WELL AS via .then
        [Symbol.asyncIterator]() {
          throw new Error("stub: async iterator not supported");
        },
      };
      return chain;
    },
    insert(tableRef: unknown) {
      const name = (tableRef as { _tableName?: keyof Store })._tableName;
      return {
        values(vals: Row) {
          if (!name) throw new Error("stub: unknown table");
          if (name === "magic_link_tokens") {
            const row = {
              id: nextTokenId++,
              token: vals.token,
              user_id: vals.userId ?? null,
              email: vals.email,
              expires_at: vals.expiresAt,
              used_at: null,
              requested_from_ip: vals.requestedFromIp ?? null,
              created_at: new Date(),
            };
            store.magic_link_tokens.push(row);
            return {
              async returning() {
                return [{ id: row.id }];
              },
              async then(resolve: (v: Row[]) => void) {
                resolve([{ id: row.id }]);
              },
            };
          }
          if (name === "notification_events") {
            const row = {
              id: nextEventId++,
              event_type: vals.eventType,
              recipient: vals.recipient,
              subject: vals.subject,
              body: vals.body,
              sent_at: new Date(),
              success: vals.success ?? false,
              retry_count: vals.retryCount ?? 0,
              error: vals.error ?? null,
              metadata: vals.metadata ?? {},
            };
            store.notification_events.push(row);
            return {
              async returning() {
                return [{ id: row.id }];
              },
              async then(resolve: (v: Row[]) => void) {
                resolve([{ id: row.id }]);
              },
            };
          }
          throw new Error(`stub: insert not implemented for ${name}`);
        },
      };
    },
    update(tableRef: unknown) {
      const name = (tableRef as { _tableName?: keyof Store })._tableName;
      let _set: Row = {};
      const chain = {
        set(vals: Row) {
          _set = vals;
          return chain;
        },
        where(predicate: (row: Row) => boolean) {
          const table = store[name!];
          const affected: Row[] = [];
          for (const r of table) {
            if (predicate(r)) {
              for (const [k, v] of Object.entries(_set)) {
                const dbKey = camelToSnake(k);
                r[dbKey] = v;
              }
              affected.push(r);
            }
          }
          return {
            async returning() {
              return affected.map((r) => ({ id: r.id }));
            },
            async then(resolve: (v: Row[]) => void) {
              resolve(affected);
            },
            catch() {
              /* noop */
            },
          };
        },
      };
      return chain;
    },
  };
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

// Mock drizzle-orm helpers so the route code works with our stub rows.
vi.mock("drizzle-orm", async () => {
  return {
    eq(col: { _columnName: string }, val: unknown) {
      return (row: Row) => row[col._columnName] === val;
    },
    and(...preds: Array<(r: Row) => boolean>) {
      return (row: Row) => preds.every((p) => p(row));
    },
    gt(col: { _columnName: string }, val: Date) {
      return (row: Row) => (row[col._columnName] as Date) > val;
    },
    gte(col: { _columnName: string }, val: Date) {
      return (row: Row) => (row[col._columnName] as Date) >= val;
    },
    isNull(col: { _columnName: string }) {
      return (row: Row) =>
        row[col._columnName] === null || row[col._columnName] === undefined;
    },
    sql: (strings: TemplateStringsArray) => strings.join(""),
  };
});

// Mock the schema module to return column refs our stub understands.
vi.mock("../../src/db/schema.js", async () => {
  function col(name: string) {
    return { _columnName: name };
  }
  function table(
    tableName: string,
    cols: Record<string, ReturnType<typeof col>>,
  ) {
    return { _tableName: tableName, ...cols };
  }
  return {
    users: table("users", {
      id: col("id"),
      email: col("email"),
      name: col("name"),
      role: col("role"),
      passwordHash: col("passwordHash"),
      lastLoginAt: col("lastLoginAt"),
    }),
    magicLinkTokens: table("magic_link_tokens", {
      id: col("id"),
      token: col("token"),
      userId: col("user_id"),
      email: col("email"),
      expiresAt: col("expires_at"),
      usedAt: col("used_at"),
      requestedFromIp: col("requested_from_ip"),
      createdAt: col("created_at"),
    }),
    notificationEvents: table("notification_events", {
      id: col("id"),
      eventType: col("event_type"),
      recipient: col("recipient"),
      subject: col("subject"),
      body: col("body"),
      sentAt: col("sent_at"),
      success: col("success"),
      retryCount: col("retry_count"),
      error: col("error"),
      metadata: col("metadata"),
    }),
  };
});

// Mock graph-email so we never actually hit the network.
vi.mock(
  "../../src/plugins/notifications/services/graph-email.service.js",
  () => ({
    sendMail: vi.fn(async () => ({ success: true })),
    readGraphConfig: () => null,
    __resetTokenCacheForTests: vi.fn(),
    diagnostics: () => ({
      name: "graph-email",
      status: "healthy" as const,
      stats: {},
      checks: [],
    }),
  }),
);

// ────────────────────────────────────────────────────────────────
// Build a tiny Fastify app with just JWT + our routes.
// We deliberately DON'T use buildApp() because its db plugin tries
// real postgres.
// ────────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance } from "fastify";
import fjwt from "@fastify/jwt";
import magicLinkRoutes from "../../src/plugins/auth/magic-link.js";

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fjwt, {
    secret: "test-secret-that-is-at-least-thirty-two-chars-long",
  });
  app.decorate("db", makeStubDb() as never);
  await app.register(magicLinkRoutes, { prefix: "/api/v1/auth" });
  await app.ready();
  return app;
}

describe("Magic-link auth flow", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetStore();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("happy path: request → token stored → verify → redirect with JWT", async () => {
    // 1. Request magic link
    const requestRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-magic-link",
      payload: { email: "user@example.com" },
    });
    expect(requestRes.statusCode).toBe(200);
    const requestBody = requestRes.json();
    expect(requestBody.success).toBe(true);
    expect(requestBody.data.message).toMatch(/sign-in link/i);

    // A token row should exist for this user
    expect(store.magic_link_tokens).toHaveLength(1);
    const tokenRow = store.magic_link_tokens[0];
    expect(tokenRow.email).toBe("user@example.com");
    expect(tokenRow.used_at).toBeNull();

    // And a notification_events row should have been written
    expect(store.notification_events).toHaveLength(1);
    expect(store.notification_events[0].event_type).toBe("magic_link");
    expect(store.notification_events[0].success).toBe(true);

    // 2. Verify token → should redirect with ?token=<jwt>
    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/v1/auth/magic-link/verify/${tokenRow.token}`,
    });
    expect(verifyRes.statusCode).toBe(302);
    const location = verifyRes.headers.location as string;
    expect(location).toMatch(/\/magic-link\?token=/);

    const url = new URL(location);
    const jwt = url.searchParams.get("token");
    expect(jwt).toBeTruthy();
    expect(jwt!.split(".")).toHaveLength(3); // JWT has 3 parts

    // Token should now be marked used
    expect(store.magic_link_tokens[0].used_at).toBeInstanceOf(Date);
  });

  it("expired token: verify redirects to /login?error=magic_link_expired", async () => {
    // Seed an expired token directly
    store.magic_link_tokens.push({
      id: 1,
      token: "a".repeat(64),
      user_id: 1,
      email: "user@example.com",
      expires_at: new Date(Date.now() - 60_000), // expired 1 min ago
      used_at: null,
      requested_from_ip: "127.0.0.1",
      created_at: new Date(Date.now() - 30 * 60_000),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/auth/magic-link/verify/${"a".repeat(64)}`,
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toMatch(/\/login\?error=magic_link_expired/);

    // Token should NOT be marked used — expired tokens don't get consumed.
    expect(store.magic_link_tokens[0].used_at).toBeNull();
  });

  it("reused token: second verify redirects to /login?error=magic_link_used", async () => {
    // Seed a valid token
    const tokenStr = "b".repeat(64);
    store.magic_link_tokens.push({
      id: 1,
      token: tokenStr,
      user_id: 1,
      email: "user@example.com",
      expires_at: new Date(Date.now() + 10 * 60_000),
      used_at: null,
      requested_from_ip: "127.0.0.1",
      created_at: new Date(),
    });

    // First verify: should succeed with JWT redirect
    const first = await app.inject({
      method: "GET",
      url: `/api/v1/auth/magic-link/verify/${tokenStr}`,
    });
    expect(first.statusCode).toBe(302);
    expect(first.headers.location).toMatch(/\/magic-link\?token=/);
    expect(store.magic_link_tokens[0].used_at).toBeInstanceOf(Date);

    // Second verify with same token: should redirect to login with used error
    const second = await app.inject({
      method: "GET",
      url: `/api/v1/auth/magic-link/verify/${tokenStr}`,
    });
    expect(second.statusCode).toBe(302);
    expect(second.headers.location).toMatch(/\/login\?error=magic_link_used/);
  });

  it("unknown email: returns generic success (no user enumeration leak)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-magic-link",
      payload: { email: "nobody@nowhere.test" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/sign-in link/i);
    // No token should be created
    expect(store.magic_link_tokens).toHaveLength(0);
  });

  it("rate limit: 4th request within 1h returns generic success but creates no new token", async () => {
    const seed = (offsetMs: number) =>
      store.magic_link_tokens.push({
        id: store.magic_link_tokens.length + 1,
        token: `seed-${store.magic_link_tokens.length}`,
        user_id: 1,
        email: "user@example.com",
        expires_at: new Date(Date.now() + 5 * 60_000),
        used_at: null,
        requested_from_ip: "127.0.0.1",
        created_at: new Date(Date.now() - offsetMs),
      });
    seed(30 * 60_000);
    seed(20 * 60_000);
    seed(10 * 60_000);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-magic-link",
      payload: { email: "user@example.com" },
    });
    expect(res.statusCode).toBe(200);
    // Should still be 3 tokens — rate limit blocked the 4th.
    expect(store.magic_link_tokens).toHaveLength(3);
  });
});
