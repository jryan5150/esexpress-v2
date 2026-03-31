import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/auth/me', () => {
  it('returns user data from valid JWT', async () => {
    const token = app.jwt.sign({
      id: 1,
      email: 'jessica@esexpress.com',
      name: 'Jessica',
      role: 'admin',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('jessica@esexpress.com');
    expect(body.data.role).toBe('admin');
  });

  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('Invite validation logic', () => {
  it('checkInvite returns role for invited email', async () => {
    const { checkInvite } = await import('../../src/plugins/auth/invite.js');
    const invites = [
      { email: 'scout@gmail.com', role: 'dispatcher' as const, accepted: false },
      { email: 'stephanie@gmail.com', role: 'dispatcher' as const, accepted: false },
    ];
    const result = checkInvite('scout@gmail.com', invites);
    expect(result).not.toBeNull();
    expect(result!.role).toBe('dispatcher');
  });

  it('checkInvite returns null for uninvited email', async () => {
    const { checkInvite } = await import('../../src/plugins/auth/invite.js');
    const invites = [
      { email: 'scout@gmail.com', role: 'dispatcher' as const, accepted: false },
    ];
    const result = checkInvite('stranger@gmail.com', invites);
    expect(result).toBeNull();
  });

  it('checkInvite returns null for already-accepted invite', async () => {
    const { checkInvite } = await import('../../src/plugins/auth/invite.js');
    const invites = [
      { email: 'scout@gmail.com', role: 'dispatcher' as const, accepted: true },
    ];
    const result = checkInvite('scout@gmail.com', invites);
    expect(result).toBeNull();
  });
});
