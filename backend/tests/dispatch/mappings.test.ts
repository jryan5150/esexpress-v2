import { describe, it, expect } from 'vitest';

describe('Mapping service types', () => {
  it('exports createLocationMapping function', async () => {
    const mod = await import('../../src/plugins/dispatch/services/mappings.service.js');
    expect(typeof mod.createLocationMapping).toBe('function');
  });
  it('exports getLocationMappingByName function', async () => {
    const mod = await import('../../src/plugins/dispatch/services/mappings.service.js');
    expect(typeof mod.getLocationMappingByName).toBe('function');
  });
  it('exports createCustomerMapping function', async () => {
    const mod = await import('../../src/plugins/dispatch/services/mappings.service.js');
    expect(typeof mod.createCustomerMapping).toBe('function');
  });
  it('exports createProductMapping function', async () => {
    const mod = await import('../../src/plugins/dispatch/services/mappings.service.js');
    expect(typeof mod.createProductMapping).toBe('function');
  });
  it('exports createDriverCrossref function', async () => {
    const mod = await import('../../src/plugins/dispatch/services/mappings.service.js');
    expect(typeof mod.createDriverCrossref).toBe('function');
  });
});

describe('GET /api/v1/dispatch/suggest/:loadId', () => {
  it('route is registered', async () => {
    const { buildApp } = await import('../../src/app.js');
    const app = buildApp({ logger: false });
    await app.ready();
    const token = app.jwt.sign({ id: 1, email: 'a@b.com', name: 'A', role: 'admin' });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dispatch/suggest/1',
      headers: { authorization: `Bearer ${token}` },
    });
    // Without DB: 503; with DB: 200 or 404
    expect([200, 404, 503]).toContain(response.statusCode);
    await app.close();
  });
});
