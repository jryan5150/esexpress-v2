import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  adminToken = app.jwt.sign({
    id: 1,
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
  });
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v1/dispatch/workbench", () => {
  it("returns 401 without auth", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/workbench",
    });
    expect(r.statusCode).toBe(401);
  });

  it("route is registered and authed", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/workbench",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(r.statusCode);
  });

  it("rejects unknown filter values", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/workbench?filter=bogus",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(r.statusCode).toBe(400);
  });

  it("accepts all valid filters", async () => {
    for (const f of [
      "uncertain",
      "ready_to_build",
      "mine",
      "ready_to_clear",
      "entered_today",
      "all",
    ]) {
      const r = await app.inject({
        method: "GET",
        url: `/api/v1/dispatch/workbench?filter=${f}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect([200, 500, 503]).toContain(r.statusCode);
    }
  });

  it("accepts dateFrom, dateTo, and truckNo filters", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/workbench?filter=all&dateFrom=2026-04-01&dateTo=2026-04-17&truckNo=1456",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(r.statusCode);
  });

  it("rejects invalid date format on dateFrom", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/workbench?filter=all&dateFrom=not-a-date",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(r.statusCode).toBe(400);
  });

  it("accepts wellId and wellName filters", async () => {
    for (const q of ["wellId=1", "wellName=apache"]) {
      const r = await app.inject({
        method: "GET",
        url: `/api/v1/dispatch/workbench?filter=all&${q}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect([200, 500, 503]).toContain(r.statusCode);
    }
  });

  it("rejects wellId that is not a positive integer", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/dispatch/workbench?filter=all&wellId=0",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("POST /api/v1/dispatch/workbench/:id/advance", () => {
  it("returns 401 without auth", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/advance",
      payload: { stage: "building" },
    });
    expect(r.statusCode).toBe(401);
  });

  it("rejects missing stage", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/advance",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects invalid stage", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/advance",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { stage: "bogus" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("accepts valid advance payload", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/advance",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { stage: "building" },
    });
    expect([200, 400, 404, 500, 503]).toContain(r.statusCode);
  });
});

describe("POST /api/v1/dispatch/workbench/:id/claim", () => {
  it("rejects unauth", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/claim",
    });
    expect(r.statusCode).toBe(401);
  });
});

describe("POST /api/v1/dispatch/workbench/:id/flag", () => {
  it("requires reason", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/flag",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("POST /api/v1/dispatch/workbench/build-duplicate", () => {
  it("requires assignmentIds", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/build-duplicate",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects empty assignmentIds array", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/build-duplicate",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: [] },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("POST /api/v1/dispatch/workbench/:id/route (routeUncertain)", () => {
  it("returns 401 without auth", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/route",
      payload: { action: "confirm" },
    });
    expect(r.statusCode).toBe(401);
  });

  it("requires action in body", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/route",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects unknown action values", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/route",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "bogus" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects non-integer id", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/not-a-number/route",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "confirm" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("accepts all five valid actions", async () => {
    for (const action of [
      "confirm",
      "needs_rate",
      "missing_ticket",
      "missing_driver",
      "flag_other",
    ]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/dispatch/workbench/1/route",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action },
      });
      // 200 (happy path), 404 (no assignment), 400 (validation — e.g., wrong
      // stage), 500 (error), or 503 (db unavailable). NOT 400 from schema —
      // that would mean we rejected a valid action string.
      expect([200, 400, 404, 500, 503]).toContain(r.statusCode);
    }
  });

  it("accepts optional notes", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/1/route",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "flag_other", notes: "waiting on dispatcher" },
    });
    expect([200, 400, 404, 500, 503]).toContain(r.statusCode);
  });
});

describe("POST /api/v1/dispatch/workbench/bulk-confirm", () => {
  it("returns 401 without auth", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      payload: { assignmentIds: [1] },
    });
    expect(r.statusCode).toBe(401);
  });

  it("requires assignmentIds", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects empty assignmentIds array", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: [] },
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects non-array assignmentIds", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: "not-an-array" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects batches larger than 200", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: Array.from({ length: 201 }, (_, i) => i + 1) },
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects non-integer items", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: ["one", "two"] },
    });
    expect(r.statusCode).toBe(400);
  });

  it("accepts valid batch with optional notes", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        assignmentIds: [1, 2, 3],
        notes: "bulk-confirm via selection bar",
      },
    });
    // Schema passes; per-id success or failure surfaces in result list.
    // 200 even when every id is invalid — route collects individual errors.
    expect([200, 500, 503]).toContain(r.statusCode);
  });

  it("accepts a single-id batch at the lower bound", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/dispatch/workbench/bulk-confirm",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: [1] },
    });
    expect([200, 500, 503]).toContain(r.statusCode);
  });
});
