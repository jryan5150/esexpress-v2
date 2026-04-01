import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
  adminToken = app.jwt.sign({ id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' });
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/dispatch/loads', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/loads',
    });
    expect(response.statusCode).toBe(401);
  });

  it('validates query params — rejects invalid source', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/loads?source=invalid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('accepts valid source filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/loads?source=propx',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});

describe('GET /api/v1/dispatch/loads/:id', () => {
  it('returns 400 for non-integer id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/loads/abc',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
});
