import type { FastifyPluginAsync } from "fastify";
import { searchLoads } from "../services/search.service.js";

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q?: string; limit?: string };
  }>(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 1 },
            limit: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { q, limit } = request.query as { q: string; limit?: string };
      const parsedLimit = limit ? Math.min(Number(limit), 20) : 10;
      const results = await searchLoads(request.server.db, q, parsedLimit);
      return reply.send({ data: results });
    },
  );
};

export default searchRoutes;
