import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Feedback Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DASHBOARD_PIN = "test-pin-1234";
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DASHBOARD_PIN;
  });

  it("POST /feedback rejects without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      payload: { category: "issue", description: "test feedback" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /feedback rejects without PIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/feedback",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /feedback/stats rejects without PIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/feedback/stats",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /feedback rejects with wrong PIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/feedback",
      headers: { "x-dashboard-pin": "wrong-pin" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /feedback/:id rejects without PIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/feedback/1",
    });
    expect(res.statusCode).toBe(401);
  });
});
