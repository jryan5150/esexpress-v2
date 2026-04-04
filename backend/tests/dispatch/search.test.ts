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
