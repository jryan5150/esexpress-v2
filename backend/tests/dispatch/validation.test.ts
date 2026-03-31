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

describe('GET /api/v1/dispatch/validation', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dispatch/validation' });
    expect(response.statusCode).toBe(401);
  });
  it('route is registered with auth', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/validation',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(response.statusCode);
  });
});

describe('GET /api/v1/dispatch/validation/tier/:n', () => {
  it('validates tier param is 1, 2, or 3', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/validation/tier/5',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(400);
  });
  it('accepts valid tier', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/validation/tier/1',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(response.statusCode);
  });
});

describe('POST /api/v1/dispatch/validation/confirm', () => {
  it('returns 400 without assignmentId', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/validation/confirm',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/dispatch/validation/reject', () => {
  it('returns 400 without assignmentId', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/validation/reject',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/dispatch/validation/resolve', () => {
  it('returns 400 without loadId and wellId', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/validation/resolve',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/dispatch/validation/trust-sheets', () => {
  it('returns 400 without assignmentIds', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/validation/trust-sheets',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
  it('rejects non-admin from trust-sheets', async () => {
    const dispatcherToken = app.jwt.sign({ id: 3, email: 'dispatcher@test.com', name: 'Dispatcher', role: 'dispatcher' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/dispatch/validation/trust-sheets',
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { assignmentIds: [1] },
    });
    expect(response.statusCode).toBe(403);
  });
});
