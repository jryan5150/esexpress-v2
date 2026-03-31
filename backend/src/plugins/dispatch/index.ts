import { type FastifyPluginAsync } from 'fastify';
import { wellRoutes } from './routes/wells.js';
import { loadRoutes } from './routes/loads.js';

const dispatchPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(wellRoutes, { prefix: '/wells' });
  fastify.register(loadRoutes, { prefix: '/loads' });
};

export default dispatchPlugin;
