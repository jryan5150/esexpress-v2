import fp from 'fastify-plugin';
import { type FastifyPluginAsync } from 'fastify';
import { createDbClient, type Database } from '../db/client.js';
import { loadConfig } from '../lib/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required — cannot start without database');
  }

  const { db, pool } = createDbClient(config.DATABASE_URL);
  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await pool.end({ timeout: 5 });
  });
};

export default fp(dbPlugin, { name: 'db' });
