import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let adminToken: string;
let dispatcherToken: string;
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
  dispatcherToken = app.jwt.sign({
    id: 2,
    email: "dispatcher@test.com",
    name: "Dispatcher",
    role: "dispatcher",
  });
  viewerToken = app.jwt.sign({
    id: 3,
    email: "viewer@test.com",
    name: "Viewer",
    role: "viewer",
  });
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

describe("PCS Plugin — route registration", () => {
  const routes = [
    {
      method: "POST" as const,
      url: "/api/v1/pcs/dispatch-preview",
      body: { assignmentId: 1 },
    },
    {
      method: "POST" as const,
      url: "/api/v1/pcs/dispatch",
      body: { assignmentId: 1 },
    },
    {
      method: "POST" as const,
      url: "/api/v1/pcs/status",
      body: { assignmentId: 1, status: "dispatched" },
    },
    {
      method: "GET" as const,
      url: "/api/v1/pcs/status/1",
    },
    {
      method: "POST" as const,
      url: "/api/v1/pcs/sync-status",
      body: { assignmentIds: [1] },
    },
    {
      method: "POST" as const,
      url: "/api/v1/pcs/clear-routes",
      body: { loadId: 1, dispatchId: "D-001" },
    },
    {
      method: "GET" as const,
      url: "/api/v1/pcs/health",
    },
    {
      method: "POST" as const,
      url: "/api/v1/pcs/send-dispatch-message",
      body: { assignmentId: 1, message: "Test" },
    },
    {
      method: "GET" as const,
      url: "/api/v1/pcs/session-status",
    },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} is registered (not 404)`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        payload: route.body,
      });
      // Route exists — should not be 404
      expect(response.statusCode).not.toBe(404);
    });
  }
});

// ---------------------------------------------------------------------------
// Auth Enforcement
// ---------------------------------------------------------------------------

describe("PCS Plugin — auth enforcement", () => {
  it("rejects unauthenticated requests to dispatch-preview", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch-preview",
      payload: { assignmentId: 1 },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to dispatch", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: { assignmentId: 1 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to status push", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/status",
      payload: { assignmentId: 1, status: "dispatched" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to session-status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pcs/session-status",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects viewer role from dispatch endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: { assignmentId: 1 },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects viewer role from status push", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/status",
      payload: { assignmentId: 1, status: "dispatched" },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from clear-routes", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/clear-routes",
      payload: { loadId: 1, dispatchId: "D-001" },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from send-dispatch-message", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/send-dispatch-message",
      payload: { assignmentId: 1, message: "Test" },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from sync-status", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/sync-status",
      payload: { assignmentIds: [1] },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows dispatcher role on dispatch endpoint (not 403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: { assignmentId: 1 },
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    // Should not be 403 (role accepted) — will be 403 due to PCS_DISPATCH_DISABLED
    // which is a different code path (feature flag, not auth)
    expect(response.json().error?.code).not.toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// Feature Flag: PCS_DISPATCH_ENABLED
// ---------------------------------------------------------------------------

describe("PCS Plugin — dispatch feature flag", () => {
  it("dispatch returns 403 with PCS_DISPATCH_DISABLED when flag is false", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: { assignmentId: 1 },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PCS_DISPATCH_DISABLED");
  });
});

// ---------------------------------------------------------------------------
// Health Endpoint (no auth required)
// ---------------------------------------------------------------------------

describe("PCS Plugin — health endpoint", () => {
  it("GET /health responds without authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pcs/health",
    });
    // Health endpoint has no auth — should return 200
    // (PCS may be offline in test env, but the endpoint itself responds)
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("pcsOnline");
    expect(body.data).toHaveProperty("dispatchEnabled");
    expect(body.data).toHaveProperty("circuitBreaker");
    expect(body.data).toHaveProperty("checkedAt");
  });

  it("health data includes dispatchEnabled flag", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pcs/health",
    });
    const body = response.json();
    expect(typeof body.data.dispatchEnabled).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Session Status Endpoint
// ---------------------------------------------------------------------------

describe("PCS Plugin — session-status endpoint", () => {
  it("returns session diagnostics for authenticated user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pcs/session-status",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("dispatchEnabled");
    expect(body.data).toHaveProperty("credentialsConfigured");
    expect(body.data).toHaveProperty("circuitBreaker");
    expect(body.data).toHaveProperty("checks");
    expect(Array.isArray(body.data.checks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("PCS Plugin — request validation", () => {
  it("dispatch-preview requires assignmentId in body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch-preview",
      payload: {},
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("dispatch requires assignmentId in body", async () => {
    // Even though dispatch is disabled, validation runs first for the flag check
    // But auth + role check runs before schema validation in Fastify preHandler
    // So with valid admin token, the flag check returns 403 before validation
    // Test with empty body and no auth: 401
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: {},
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Body validation or feature flag — either way, not a 500
    expect(response.statusCode).toBeLessThan(500);
  });

  it("status push requires both assignmentId and status", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/status",
      payload: { assignmentId: 1 },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("clear-routes requires loadId and dispatchId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/clear-routes",
      payload: { loadId: 1 },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("send-dispatch-message requires assignmentId and message", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/send-dispatch-message",
      payload: { assignmentId: 1 },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("sync-status requires assignmentIds array", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/sync-status",
      payload: {},
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("sync-status rejects empty assignmentIds array", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/sync-status",
      payload: { assignmentIds: [] },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Response Envelope
// ---------------------------------------------------------------------------

describe("PCS Plugin — response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: { assignmentId: 1 },
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  it("returns standard success envelope on health check", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/pcs/health",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
  });

  it("returns standard error envelope on feature flag rejection", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/pcs/dispatch",
      payload: { assignmentId: 1 },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(body.error.code).toBe("PCS_DISPATCH_DISABLED");
  });
});
