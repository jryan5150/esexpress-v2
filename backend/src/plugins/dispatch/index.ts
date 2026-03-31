import { type FastifyPluginAsync } from 'fastify';
import { wellRoutes } from './routes/wells.js';

const dispatchPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(wellRoutes, { prefix: '/wells' });
};

export default dispatchPlugin;
