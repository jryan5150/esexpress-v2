import type { FastifyPluginAsync } from "fastify";
import {
  insertBreadcrumbs,
  type BreadcrumbEvent,
} from "../services/breadcrumbs.service.js";

const breadcrumbRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { events: BreadcrumbEvent[] };
  }>(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["events"],
          properties: {
            events: {
              type: "array",
              items: {
                type: "object",
                required: ["eventType", "zone", "timestamp"],
                properties: {
                  eventType: { type: "string" },
                  eventData: { type: "object" },
                  zone: {
                    type: "string",
                    enum: ["live", "archive", "search"],
                  },
                  timestamp: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { events } = request.body;
      const userId = (request.user as { id: number }).id;

      // Fire-and-forget: don't await, don't block
      insertBreadcrumbs(request.server.db, userId, events).catch((err) => {
        request.log.warn({ err }, "breadcrumb insert failed (non-blocking)");
      });

      return reply.status(202).send();
    },
  );
};

export default breadcrumbRoutes;
