import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('JWT Plugin', () => {
  it('app.jwt is available after registration', async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    expect(app.jwt).toBeDefined();
    expect(typeof app.jwt.sign).toBe('function');
    expect(typeof app.jwt.verify).toBe('function');
    await app.close();
  });

  it('sign and verify round-trips a payload', async () => {
    const app = buildApp({ logger: false });
    await app.ready();
    const token = app.jwt.sign({ id: 1, email: 'test@example.com', role: 'admin' });
    const decoded = app.jwt.verify<{ id: number; email: string; role: string }>(token);
    expect(decoded.id).toBe(1);
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('admin');
    await app.close();
  });
});
