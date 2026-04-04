import { type FastifyPluginAsync } from "fastify";
import { wellRoutes } from "./routes/wells.js";
import { loadRoutes } from "./routes/loads.js";
import { assignmentRoutes } from "./routes/assignments.js";
import { validationRoutes } from "./routes/validation.js";
import { dispatchDeskRoutes } from "./routes/dispatch-desk.js";
import { autoMapRoutes } from "./routes/auto-map.js";
import { presenceRoutes } from "./routes/presence.js";
import breadcrumbRoutes from "./routes/breadcrumbs.js";
import searchRoutes from "./routes/search.js";

const dispatchPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(wellRoutes, { prefix: "/wells" });
  fastify.register(loadRoutes, { prefix: "/loads" });
  fastify.register(assignmentRoutes, { prefix: "/assignments" });
  fastify.register(validationRoutes, { prefix: "/validation" });
  fastify.register(dispatchDeskRoutes, { prefix: "/dispatch-desk" });
  fastify.register(autoMapRoutes, { prefix: "/auto-map" });
  fastify.register(presenceRoutes, { prefix: "/presence" });
  fastify.register(breadcrumbRoutes, { prefix: "/breadcrumbs" });
  fastify.register(searchRoutes, { prefix: "/search" });

  // GET /dispatch-readiness — field completeness and readiness metrics
  fastify.get(
    "/dispatch-readiness",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }
      const { getDispatchReadiness } =
        await import("./services/dispatch-desk.service.js");
      const data = await getDispatchReadiness(db);
      return { success: true, data };
    },
  );

  // GET /suggest/:loadId — suggest wells for a load
  fastify.get(
    "/suggest/:loadId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["loadId"],
          properties: { loadId: { type: "integer" } },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }

      const { eq } = await import("drizzle-orm");
      const { loads, wells } = await import("../../db/schema.js");
      const { scoreSuggestions } =
        await import("./services/suggestion.service.js");
      const { getLocationMappingByName } =
        await import("./services/mappings.service.js");

      const { loadId } = request.params as { loadId: number };
      const [load] = await db
        .select()
        .from(loads)
        .where(eq(loads.id, loadId))
        .limit(1);
      if (!load) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Load with id ${loadId} not found`,
          },
        });
      }

      // Check confirmed mapping first
      if (load.destinationName) {
        const existingMapping = await getLocationMappingByName(
          db,
          load.destinationName,
        );
        if (existingMapping?.confirmed && existingMapping.wellId) {
          const [well] = await db
            .select()
            .from(wells)
            .where(eq(wells.id, existingMapping.wellId))
            .limit(1);
          if (well) {
            return {
              success: true,
              data: [
                {
                  wellId: well.id,
                  wellName: well.name,
                  score: 1.0,
                  tier: 1,
                  matchType: "confirmed_mapping",
                },
              ],
            };
          }
        }
      }

      // Run suggestion engine
      const allWells = await db
        .select({
          id: wells.id,
          name: wells.name,
          aliases: wells.aliases,
          propxJobId: wells.propxJobId,
        })
        .from(wells)
        .where(eq(wells.status, "active"));

      const candidates = allWells.map(
        (w: {
          id: number;
          name: string;
          aliases: unknown;
          propxJobId: string | null;
        }) => ({
          ...w,
          aliases: (w.aliases ?? []) as string[],
          propxJobId: w.propxJobId,
        }),
      );

      const propxJobId =
        ((load.rawData as Record<string, unknown> | null)?.["propx_job_id"] as
          | string
          | null) ??
        ((load.rawData as Record<string, unknown> | null)?.["job_id"] as
          | string
          | null) ??
        null;
      const suggestions = scoreSuggestions(
        load.destinationName ?? "",
        propxJobId,
        candidates,
      );
      return { success: true, data: suggestions };
    },
  );
};

export default dispatchPlugin;
