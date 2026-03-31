import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock the db module for unit tests (no real database)
vi.mock('../../src/db/client.js', () => ({
  createDbClient: vi.fn(),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/v1/auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: 'test123' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when password is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@test.com' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
  });
});

describe('Auth Service — hashPassword / verifyPassword', () => {
  it('hashes and verifies a password', async () => {
    const { hashPassword, verifyPassword } = await import('../../src/plugins/auth/service.js');
    const hash = await hashPassword('test-password-123');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('test-password-123');
    const valid = await verifyPassword('test-password-123', hash);
    expect(valid).toBe(true);
    const invalid = await verifyPassword('wrong-password', hash);
    expect(invalid).toBe(false);
  });
});
