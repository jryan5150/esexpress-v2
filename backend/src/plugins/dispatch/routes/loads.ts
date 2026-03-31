import { type FastifyPluginAsync } from 'fastify';
import { queryLoads, getLoadById } from '../services/loads.service.js';

const loadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['propx', 'logistiq', 'manual'] },
            status: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const db = (fastify as any).db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const filters = request.query as any;
      const result = await queryLoads(db, filters);
      return { success: true, data: result.data, meta: result.meta };
    },
  );

  fastify.get(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
      },
    },
    async (request, reply) => {
      const db = (fastify as any).db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not connected' },
        });
      }
      const { id } = request.params as { id: number };
      const load = await getLoadById(db, id);
      if (!load) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: `Load with id ${id} not found` },
        });
      }
      return { success: true, data: load };
    },
  );
};

export { loadRoutes };
