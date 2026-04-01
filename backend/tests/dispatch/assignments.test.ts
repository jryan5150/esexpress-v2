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

describe('GET /api/v1/dispatch/assignments/queue', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dispatch/assignments/queue' });
    expect(response.statusCode).toBe(401);
  });
  it('route is registered with auth', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/assignments/queue',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});

describe('GET /api/v1/dispatch/assignments/daily', () => {
  it('route is registered', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/assignments/daily',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});

describe('GET /api/v1/dispatch/assignments/stats', () => {
  it('route is registered', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/assignments/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});

describe('GET /api/v1/dispatch/assignments/pending-review', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dispatch/assignments/pending-review' });
    expect(response.statusCode).toBe(401);
  });
  it('route is registered with auth', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/assignments/pending-review',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 500, 503]).toContain(response.statusCode);
  });
});

describe('PUT /api/v1/dispatch/assignments/:id/status', () => {
  it('returns 400 without newStatus in body', async () => {
    const response = await app.inject({
      method: 'PUT', url: '/api/v1/dispatch/assignments/1/status',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
  it('validates newStatus is a valid status enum', async () => {
    const response = await app.inject({
      method: 'PUT', url: '/api/v1/dispatch/assignments/1/status',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newStatus: 'invalid_status' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/dispatch/assignments/bulk-assign', () => {
  it('returns 400 without required fields', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/assignments/bulk-assign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/dispatch/assignments/bulk-approve', () => {
  it('returns 400 without assignmentIds', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/assignments/bulk-approve',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});
