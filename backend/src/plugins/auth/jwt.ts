import fp from 'fastify-plugin';
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

export default fp(jwtPlugin, { name: 'jwt' });
