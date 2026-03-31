import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { AppError } from './lib/errors.js';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  // CORS
  app.register(cors, { origin: true });

  // Swagger
  app.register(swagger, {
    openapi: {
      info: {
        title: 'EsExpress v2 API',
        description: 'Oilfield dispatch platform API',
        version: '1.0.0',
      },
      servers: [{ url: '/api/v1' }],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/api/v1/docs',
  });

  // Health check
  app.get(
    '/api/v1/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  timestamp: { type: 'string' },
                  uptime: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      return {
        success: true,
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
      };
    },
  );

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }

    // Unknown errors
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: statusCode === 500 ? 'Internal server error' : error.message,
      },
    });
  });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  return app;
}
