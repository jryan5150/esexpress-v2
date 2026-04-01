import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbClient {
  db: Database;
  pool: postgres.Sql;
}

export function createDbClient(connectionString: string): DbClient {
  const pool = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Required for PgBouncer (Railway)
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}
