/**
 * Admin Settings routes — manage app_settings (feature flags + config)
 * from the UI. Admin-only.
 *
 * Primary use case: flip pcs_dispatch_enabled without touching Railway.
 * Any audit trail lives in app_settings.updated_by + updated_at. (Longer
 * history via data_integrity_runs is overkill for a toggle — the
 * timestamp + user is the history.)
 */

import type { FastifyPluginAsync } from "fastify";

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / — list all settings (admin only)
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
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
      const { listAppSettings } =
        await import("../services/app-settings.service.js");
      const rows = await listAppSettings(db);
      return { success: true, data: rows };
    },
  );

  // PUT /:key — update a single setting (admin only)
  fastify.put(
    "/:key",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        params: {
          type: "object",
          required: ["key"],
          properties: { key: { type: "string", minLength: 1, maxLength: 100 } },
        },
        body: {
          type: "object",
          required: ["value"],
          properties: {
            value: { type: ["string", "null"] },
          },
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
      const { key } = request.params as { key: string };
      const { value } = request.body as { value: string | null };
      const user = request.user as { id: number; name: string };

      const { setAppSetting } =
        await import("../services/app-settings.service.js");
      await setAppSetting(db, key, value, user.id);
      return {
        success: true,
        data: {
          key,
          value,
          updatedBy: user.name,
          updatedAt: new Date().toISOString(),
        },
      };
    },
  );
};
