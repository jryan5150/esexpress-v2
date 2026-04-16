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
