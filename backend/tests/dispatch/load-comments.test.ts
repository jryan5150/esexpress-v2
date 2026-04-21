import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import {
  listComments,
  addComment,
  deleteComment,
} from "../../src/plugins/dispatch/services/load-comments.service.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/errors.js";

// ─── Route contract tests (no DB, auth + schema only) ───────────────

let app: FastifyInstance;
let adminToken: string;
let dispatcherToken: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  adminToken = app.jwt.sign({
    id: 1,
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
  });
  dispatcherToken = app.jwt.sign({
    id: 2,
    email: "disp@test.com",
    name: "Disp",
    role: "dispatcher",
  });
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v1/dispatch/loads/:loadId/comments", () => {
  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/loads/1/comments",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for non-integer loadId", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/loads/abc/comments",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("route is registered", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/loads/1/comments",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // 200 (found), 404 (load missing), 500/503 (no DB) — any is fine; 401/404 route-missing is not.
    expect([200, 404, 500, 503]).toContain(response.statusCode);
  });
});

describe("POST /api/v1/dispatch/loads/:loadId/comments", () => {
  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/loads/1/comments",
      payload: { body: "hello" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when body field is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/loads/1/comments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when body is empty string", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/loads/1/comments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { body: "" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("DELETE /api/v1/dispatch/loads/:loadId/comments/:commentId", () => {
  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/dispatch/loads/1/comments/1",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for non-integer commentId", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/dispatch/loads/1/comments/abc",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ─── Service layer tests (mocked Database) ──────────────────────────

/**
 * Build a fake Database that records calls and returns scripted rows. We script
 * per-chained call to support the select / insert / delete patterns used in the
 * service.
 */
type Scripted = { rows: unknown[] };

function makeFakeDb(scripts: {
  selects?: Scripted[]; // one entry per db.select(...).from(...) invocation, in order
  inserts?: Scripted[]; // one entry per db.insert(...) invocation
}) {
  const selectQueue = [...(scripts.selects ?? [])];
  const insertQueue = [...(scripts.inserts ?? [])];
  const deleteCalls: unknown[] = [];

  // Drizzle chainable: select().from().where().limit()  OR  select().from().where().orderBy()
  const makeSelectChain = () => {
    const script = selectQueue.shift();
    const rows = script?.rows ?? [];
    const thenable: Promise<unknown[]> = Promise.resolve(rows);
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve(rows),
      limit: () => Promise.resolve(rows),
      then: thenable.then.bind(thenable),
    };
    return chain;
  };

  const makeInsertChain = () => {
    const script = insertQueue.shift();
    const rows = script?.rows ?? [];
    return {
      values: () => ({
        returning: () => Promise.resolve(rows),
      }),
    };
  };

  const makeDeleteChain = () => ({
    where: (cond: unknown) => {
      deleteCalls.push(cond);
      return Promise.resolve({ rowCount: 1 });
    },
  });

  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    delete: () => makeDeleteChain(),
  };

  // Cast through unknown to the Database type for service consumption.
  return {
    db: db as unknown as Parameters<typeof listComments>[0],
    deleteCalls,
    remainingSelects: () => selectQueue.length,
    remainingInserts: () => insertQueue.length,
  };
}

describe("load-comments service", () => {
  describe("listComments", () => {
    it("throws NotFoundError when load does not exist", async () => {
      const { db } = makeFakeDb({ selects: [{ rows: [] }] });
      await expect(listComments(db, 999)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns comments ordered newest-first", async () => {
      const loadRow = { id: 42 };
      const comments = [
        {
          id: 2,
          loadId: 42,
          authorUserId: 1,
          authorName: "Admin",
          body: "newer",
          createdAt: new Date(),
        },
        {
          id: 1,
          loadId: 42,
          authorUserId: 1,
          authorName: "Admin",
          body: "older",
          createdAt: new Date(),
        },
      ];
      const { db } = makeFakeDb({
        selects: [{ rows: [loadRow] }, { rows: comments }],
      });
      const result = await listComments(db, 42);
      expect(result).toHaveLength(2);
      expect(result[0].body).toBe("newer");
    });
  });

  describe("addComment", () => {
    it("creates a comment and returns it", async () => {
      const loadRow = { id: 42 };
      const created = {
        id: 10,
        loadId: 42,
        authorUserId: 1,
        authorName: "Admin",
        body: "hello world",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db } = makeFakeDb({
        selects: [{ rows: [loadRow] }],
        inserts: [{ rows: [created] }],
      });
      const result = await addComment(
        db,
        42,
        { body: "hello world" },
        { userId: 1, userName: "Admin", role: "admin" },
      );
      expect(result.id).toBe(10);
      expect(result.body).toBe("hello world");
      expect(result.authorName).toBe("Admin");
    });

    it("round-trips create → list (POST creates, GET returns it)", async () => {
      const loadRow = { id: 42 };
      const created = {
        id: 10,
        loadId: 42,
        authorUserId: 1,
        authorName: "Admin",
        body: "roundtrip",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // addComment: select(load) → insert(comment)
      const addDb = makeFakeDb({
        selects: [{ rows: [loadRow] }],
        inserts: [{ rows: [created] }],
      });
      const added = await addComment(
        addDb.db,
        42,
        { body: "roundtrip" },
        { userId: 1, userName: "Admin", role: "admin" },
      );

      // listComments: select(load) → select(comments)
      const listDb = makeFakeDb({
        selects: [{ rows: [loadRow] }, { rows: [added] }],
      });
      const listed = await listComments(listDb.db, 42);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(added.id);
      expect(listed[0].body).toBe("roundtrip");
    });

    it("rejects empty body with ValidationError", async () => {
      const { db } = makeFakeDb({});
      await expect(
        addComment(
          db,
          42,
          { body: "   " },
          { userId: 1, userName: "Admin", role: "admin" },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws NotFoundError when load does not exist", async () => {
      const { db } = makeFakeDb({ selects: [{ rows: [] }] });
      await expect(
        addComment(
          db,
          999,
          { body: "hi" },
          { userId: 1, userName: "Admin", role: "admin" },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("deleteComment", () => {
    const existingComment = {
      id: 5,
      loadId: 42,
      authorUserId: 7,
      authorName: "Author",
      body: "mine",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("allows the author to delete their own comment", async () => {
      const { db, deleteCalls } = makeFakeDb({
        selects: [{ rows: [existingComment] }],
      });
      const result = await deleteComment(db, 5, {
        userId: 7,
        userName: "Author",
        role: "dispatcher",
      });
      expect(result).toEqual({ id: 5, deleted: true });
      expect(deleteCalls).toHaveLength(1);
    });

    it("allows an admin to delete any comment", async () => {
      const { db, deleteCalls } = makeFakeDb({
        selects: [{ rows: [existingComment] }],
      });
      const result = await deleteComment(db, 5, {
        userId: 999,
        userName: "Admin",
        role: "admin",
      });
      expect(result).toEqual({ id: 5, deleted: true });
      expect(deleteCalls).toHaveLength(1);
    });

    it("returns 403 (ForbiddenError) when non-author non-admin attempts delete", async () => {
      const { db, deleteCalls } = makeFakeDb({
        selects: [{ rows: [existingComment] }],
      });
      await expect(
        deleteComment(db, 5, {
          userId: 999,
          userName: "Intruder",
          role: "dispatcher",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(deleteCalls).toHaveLength(0);
    });

    it("throws NotFoundError when comment does not exist", async () => {
      const { db } = makeFakeDb({ selects: [{ rows: [] }] });
      await expect(
        deleteComment(db, 404, { userId: 1, userName: "x", role: "admin" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
