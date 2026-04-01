import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let adminToken: string;
let viewerToken: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  adminToken = app.jwt.sign({
    id: 1,
    email: "admin@test.com",
    name: "Admin",
    role: "admin",
  });
  viewerToken = app.jwt.sign({
    id: 2,
    email: "viewer@test.com",
    name: "Viewer",
    role: "viewer",
  });
});

afterAll(async () => {
  await app.close();
});

describe("Ingestion Plugin — route registration", () => {
  const routes = [
    {
      method: "POST" as const,
      url: "/api/v1/ingestion/sync/propx?from=2026-01-01&to=2026-01-31",
    },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/carriers" },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/drivers" },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/terminals" },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/destinations" },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/products" },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/jobs" },
    { method: "GET" as const, url: "/api/v1/ingestion/propx/jobs/123/loads" },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url.split("?")[0]} is registered (not 404)`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
      });
      // Should not be 404 (route exists), but will be 401 (no auth token)
      expect(response.statusCode).not.toBe(404);
    });
  }
});

describe("Ingestion Plugin — auth enforcement", () => {
  it("rejects unauthenticated requests to sync endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/propx?from=2026-01-01&to=2026-01-31",
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to reference data endpoints", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/propx/carriers",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects viewer role from sync endpoint (requires admin/dispatcher)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/propx?from=2026-01-01&to=2026-01-31",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("Ingestion Plugin — sync validation", () => {
  it("requires from and to query params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/propx",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires both from and to (missing to)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/propx?from=2026-01-01",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires both from and to (missing from)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/propx?to=2026-01-31",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("Ingestion Plugin — response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/propx/carriers",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  it("returns standard error envelope on validation failure", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingestion/sync/propx",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });
});

describe("Ingestion Plugin — jobs endpoint query params", () => {
  it("accepts optional status filter on jobs endpoint", async () => {
    // This should pass validation (not 400) — will fail at PropX client level
    // since PROPX_API_KEY is not set, but that proves the route + validation work
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/propx/jobs?status=active",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Should not be 400 (validation passes) or 404 (route exists)
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(400);
  });
});
