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

afterAll(async () => { await app.close(); });

describe('GET /api/v1/dispatch/dispatch-desk', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dispatch/dispatch-desk' });
    expect(response.statusCode).toBe(401);
  });
  it('route is registered with auth', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/dispatch-desk',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(response.statusCode);
  });
  it('accepts wellId filter', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/dispatch-desk?wellId=1',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(response.statusCode);
  });
  it('accepts photoStatus filter', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/dispatch-desk?photoStatus=attached',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(response.statusCode);
  });
});

describe('POST /api/v1/dispatch/dispatch-desk/mark-entered', () => {
  it('returns 400 without assignmentIds', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/dispatch-desk/mark-entered',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
  it('requires pcsStartingNumber', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/dispatch-desk/mark-entered',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentIds: [1] },
    });
    expect(response.statusCode).toBe(400);
  });
  it('rejects viewer role', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/dispatch/dispatch-desk/mark-entered',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { assignmentIds: [1], pcsStartingNumber: 100 },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('GET /api/v1/dispatch/dispatch-readiness', () => {
  it('route is registered', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/dispatch/dispatch-readiness',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(response.statusCode);
  });
});

describe('Photo status gating logic', () => {
  it('computePhotoStatus returns missing when no photos', async () => {
    const { computePhotoStatus } = await import('../../src/plugins/dispatch/services/dispatch-desk.service.js');
    expect(computePhotoStatus(0, 0)).toBe('missing');
  });
  it('computePhotoStatus returns attached when all matched', async () => {
    const { computePhotoStatus } = await import('../../src/plugins/dispatch/services/dispatch-desk.service.js');
    expect(computePhotoStatus(2, 2)).toBe('attached');
  });
  it('computePhotoStatus returns pending when some matched', async () => {
    const { computePhotoStatus } = await import('../../src/plugins/dispatch/services/dispatch-desk.service.js');
    expect(computePhotoStatus(1, 2)).toBe('pending');
  });
  it('canMarkEntered returns false when photo_status is missing', async () => {
    const { canMarkEntered } = await import('../../src/plugins/dispatch/services/dispatch-desk.service.js');
    expect(canMarkEntered('missing')).toBe(false);
  });
  it('canMarkEntered returns true when photo_status is attached', async () => {
    const { canMarkEntered } = await import('../../src/plugins/dispatch/services/dispatch-desk.service.js');
    expect(canMarkEntered('attached')).toBe(true);
  });
  it('canMarkEntered returns true when photo_status is pending (amber warning)', async () => {
    const { canMarkEntered } = await import('../../src/plugins/dispatch/services/dispatch-desk.service.js');
    expect(canMarkEntered('pending')).toBe(true);
  });
});
