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
