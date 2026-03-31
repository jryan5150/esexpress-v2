import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ logger: false });

  // Register test routes inside a plugin so decorators are resolved after
  // guardsPlugin has run (plugins initialize in registration order during ready())
  app.register(async (instance) => {
    instance.get('/test/protected', {
      preHandler: [instance.authenticate],
    }, async (request) => {
      return { success: true, data: { user: request.user } };
    });

    instance.get('/test/admin-only', {
      preHandler: [instance.authenticate, instance.requireRole(['admin'])],
    }, async (request) => {
      return { success: true, data: { user: request.user } };
    });
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Auth Guards', () => {
  it('rejects request without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects request with invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('allows request with valid token', async () => {
    const token = app.jwt.sign({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' });
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.user.email).toBe('test@test.com');
  });

  it('rejects non-admin from admin-only route', async () => {
    const token = app.jwt.sign({ id: 2, email: 'viewer@test.com', name: 'Viewer', role: 'viewer' });
    const response = await app.inject({
      method: 'GET',
      url: '/test/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows admin to access admin-only route', async () => {
    const token = app.jwt.sign({ id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' });
    const response = await app.inject({
      method: 'GET',
      url: '/test/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });
});
