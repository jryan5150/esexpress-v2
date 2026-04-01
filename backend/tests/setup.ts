// Global test setup — provide a dummy DATABASE_URL so the db plugin
// can boot without a real database. postgres.js is lazy (no connection
// until the first query), so this is safe for unit tests.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/esexpress_test';
}
