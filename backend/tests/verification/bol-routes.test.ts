import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { MAX_RETRY_COUNT } from "../../src/plugins/verification/services/bol-extraction.service.js";

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
// Route registration -- all 12 BOL routes respond (not 404)
// ---------------------------------------------------------------------------

describe("BOL Routes -- route registration", () => {
  const driverRoutes = [
    {
      method: "POST" as const,
      url: "/api/v1/verification/bol/submit",
      description: "submit",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/bol/submissions",
      description: "list submissions",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/bol/submissions/1",
      description: "submission detail",
    },
    {
      method: "PUT" as const,
      url: "/api/v1/verification/bol/submissions/1",
      description: "confirm submission",
    },
    {
      method: "POST" as const,
      url: "/api/v1/verification/bol/submissions/1/retry",
      description: "retry extraction",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/bol/driver-stats/driver-123",
      description: "driver stats",
    },
  ];

  const operationsRoutes = [
    {
      method: "GET" as const,
      url: "/api/v1/verification/bol/operations/queue",
      description: "reconciliation queue",
    },
    {
      method: "POST" as const,
      url: "/api/v1/verification/bol/operations/reconcile/1",
      description: "reconcile submission",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/bol/operations/discrepancies",
      description: "discrepancies",
    },
    {
      method: "POST" as const,
      url: "/api/v1/verification/bol/operations/auto-match",
      description: "auto-match batch",
    },
    {
      method: "POST" as const,
      url: "/api/v1/verification/bol/operations/manual-match",
      description: "manual match",
    },
    {
      method: "GET" as const,
      url: "/api/v1/verification/bol/operations/stats",
      description: "operations stats",
    },
  ];

  for (const route of [...driverRoutes, ...operationsRoutes]) {
    it(`${route.method} ${route.description} is registered (not 404)`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
      });
      // Route exists -- should not be 404. Will be 401 (no auth token)
      expect(response.statusCode).not.toBe(404);
    });
  }
});

// ---------------------------------------------------------------------------
// Auth enforcement -- driver-facing routes require authentication
// ---------------------------------------------------------------------------

describe("BOL Routes -- driver-facing auth enforcement", () => {
  it("rejects unauthenticated requests to bol/submissions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/submissions",
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to bol/submissions/:id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/submissions/1",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to bol/submit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/submit",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated requests to bol/driver-stats/:driverId", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/driver-stats/driver-123",
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows viewer role on driver-facing routes (authenticated)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/submissions",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    // Viewer should pass auth -- will fail at DB level (no DB), not auth
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Auth enforcement -- operations routes require admin/dispatcher
// ---------------------------------------------------------------------------

describe("BOL Routes -- operations auth enforcement", () => {
  it("rejects unauthenticated requests to operations/queue", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/operations/queue",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects viewer role from operations/queue", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/operations/queue",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects viewer role from operations/auto-match", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/operations/auto-match",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from operations/manual-match", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/operations/manual-match",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { submissionId: 1, loadId: 1 },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from operations/reconcile/:id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/operations/reconcile/1",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from operations/discrepancies", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/operations/discrepancies",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects viewer role from operations/stats", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/operations/stats",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows admin role on operations/queue (not 403)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/operations/queue",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });

  it("allows dispatcher role on operations/stats (not 403)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/operations/stats",
      headers: { authorization: `Bearer ${dispatcherToken}` },
    });
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Submit endpoint -- validation
// ---------------------------------------------------------------------------

describe("BOL Routes -- submit validation", () => {
  it("requires at least one photo (empty form returns 400)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/submit",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "multipart/form-data; boundary=boundary123",
      },
      payload:
        "--boundary123\r\n" +
        'Content-Disposition: form-data; name="driverId"\r\n\r\n' +
        "driver-1\r\n" +
        "--boundary123--\r\n",
    });
    // Without a database the route returns 503 or 400.
    // The key test: it should not be 404 (route exists) or 403 (auth passes)
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Retry endpoint -- MAX_RETRY_COUNT validation
// ---------------------------------------------------------------------------

describe("BOL Routes -- retry count validation", () => {
  it("exports MAX_RETRY_COUNT as 3", () => {
    expect(MAX_RETRY_COUNT).toBe(3);
  });

  it("retry route exists and requires auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/submissions/1/retry",
    });
    expect(response.statusCode).toBe(401);
  });

  it("retry route accepts authenticated requests (not 404/403)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/submissions/1/retry",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Will be 503 (no DB) -- but not 404 or 403
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Confirm/correct endpoint -- validation
// ---------------------------------------------------------------------------

describe("BOL Routes -- confirm/correct validation", () => {
  it("requires corrections field in body", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/verification/bol/submissions/1",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    // Should fail validation (400) since corrections is required
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Manual match -- validation
// ---------------------------------------------------------------------------

describe("BOL Routes -- manual match validation", () => {
  it("requires submissionId and loadId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/operations/manual-match",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires submissionId to be integer", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/verification/bol/operations/manual-match",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { submissionId: "abc", loadId: 1 },
    });
    expect(response.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

describe("BOL Routes -- response envelope", () => {
  it("returns standard error envelope on auth failure", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/verification/bol/submissions",
    });
    const body = response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });
});
