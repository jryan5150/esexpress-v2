import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { AppError } from "./lib/errors.js";
import jwtPlugin from "./plugins/auth/jwt.js";
import guardsPlugin from "./plugins/auth/guards.js";
import dbPlugin from "./plugins/db.js";
import authRoutes from "./plugins/auth/routes.js";
import dispatchPlugin from "./plugins/dispatch/index.js";
import ingestionPlugin from "./plugins/ingestion/index.js";
import pcsPlugin from "./plugins/pcs/index.js";
import sheetsPlugin from "./plugins/sheets/index.js";
import verificationPlugin from "./plugins/verification/index.js";
import financePlugin from "./plugins/finance/index.js";

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  // CORS
  app.register(cors, { origin: true });

  // Rate limiting (global: 100 req/min, tighter on auth)
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // Swagger
  app.register(swagger, {
    openapi: {
      info: {
        title: "EsExpress v2 API",
        description: "Oilfield dispatch platform API",
        version: "1.0.0",
      },
      servers: [{ url: "/api/v1" }],
    },
  });

  app.register(swaggerUi, {
    routePrefix: "/api/v1/docs",
  });

  // JWT
  app.register(jwtPlugin);

  // Auth guards
  app.register(guardsPlugin);

  // Database
  app.register(dbPlugin);

  // Auth routes
  app.register(authRoutes, { prefix: "/api/v1/auth" });

  // Dispatch plugin (P1)
  app.register(dispatchPlugin, { prefix: "/api/v1/dispatch" });

  // Ingestion plugin (PropX, Logistiq)
  app.register(ingestionPlugin, { prefix: "/api/v1/ingestion" });

  // PCS plugin (dispatch to PCS Express)
  app.register(pcsPlugin, { prefix: "/api/v1/pcs" });

  // Sheets plugin (Google Sheets import/export)
  app.register(sheetsPlugin, { prefix: "/api/v1/sheets" });

  // Verification plugin (photos, JotForm, BOL)
  app.register(verificationPlugin, { prefix: "/api/v1/verification" });

  // Finance plugin (payment batches, driver payments)
  app.register(financePlugin, { prefix: "/api/v1/finance" });

  // Health check
  app.get(
    "/api/v1/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  timestamp: { type: "string" },
                  uptime: { type: "number" },
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
          status: "ok",
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
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
    }

    // Unknown errors
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: statusCode === 500 ? "Internal server error" : error.message,
      },
    });
  });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  return app;
}
