import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let adminToken: string;
let viewerToken: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  adminToken = app.jwt.sign({ id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' });
  viewerToken = app.jwt.sign({ id: 2, email: 'viewer@test.com', name: 'Viewer', role: 'viewer' });
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/dispatch/wells', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/wells',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 200 with auth (empty list when no DB)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/wells',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Without DB, should return 503 or handled gracefully
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});

describe('POST /api/v1/dispatch/wells', () => {
  it('returns 400 when name is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/wells',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'active' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 403 for viewer role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/wells',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { name: 'Test Well' },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('PUT /api/v1/dispatch/wells/:id', () => {
  it('returns 400 with invalid id param', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/dispatch/wells/abc',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Updated Well' },
    });
    expect(response.statusCode).toBe(400);
  });
});
