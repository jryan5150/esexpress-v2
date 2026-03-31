import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Swagger', () => {
  it('GET /api/v1/docs returns Swagger UI HTML', async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/docs',
    });
    // Swagger UI redirects to /api/v1/docs/ with trailing slash
    expect([200, 302]).toContain(response.statusCode);
    await app.close();
  });

  it('GET /api/v1/docs/json returns OpenAPI spec', async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/docs/json',
    });
    expect(response.statusCode).toBe(200);
    const spec = response.json();
    expect(spec.openapi).toBeDefined();
    expect(spec.info.title).toBe('EsExpress v2 API');
    await app.close();
  });
});
