import { type FastifyPluginAsync } from 'fastify';
import fjwt from '@fastify/jwt';
import { loadConfig } from '../../lib/config.js';

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const config = loadConfig();
  await fastify.register(fjwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '24h' },
  });
};

// Break Fastify encapsulation so app.jwt is available on the root instance
(jwtPlugin as { [key: symbol]: unknown })[Symbol.for('skip-override')] = true;

export default jwtPlugin;
