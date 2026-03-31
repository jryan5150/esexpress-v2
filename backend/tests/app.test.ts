import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('App Factory', () => {
  it('builds a Fastify instance', async () => {
    const app = buildApp({ logger: false });
    expect(app).toBeDefined();
    expect(app.server).toBeDefined();
    await app.close();
  });

  it('GET /api/v1/health returns 200 with status ok', async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    await app.close();
  });

  it('returns 404 for unknown routes with error envelope', async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nonexistent',
    });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    await app.close();
  });
});
