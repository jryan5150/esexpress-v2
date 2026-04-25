import { type FastifyPluginAsync } from "fastify";
import {
  ASSIGNMENT_EXPORT_COLUMNS,
  WELL_EXPORT_COLUMNS,
  MAX_EXPORT_ROWS,
  exportAssignments,
  exportWells,
  previewImport,
  executeImport,
  listAccessibleSheets,
  getGoogleAuth,
  diagnostics,
  validateFromSheet,
  inspectSheet,
  type ExportFilters,
  type ColumnMap,
  type PreviewResult,
  type ImportOptions,
} from "../services/sheets.service.js";
import {
  syncLoadCountSheet,
  computeWeekParity,
  LOAD_COUNT_SHEET_ID,
} from "../services/loadcount-sync.service.js";

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const sheetsRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /export/columns — available column configs ───────────────
  fastify.get("/export/columns", async (_request, _reply) => {
    return {
      success: true,
      data: {
        assignment: {
          columns: ASSIGNMENT_EXPORT_COLUMNS,
          total: ASSIGNMENT_EXPORT_COLUMNS.length,
        },
        well: {
          columns: WELL_EXPORT_COLUMNS,
          total: WELL_EXPORT_COLUMNS.length,
        },
        maxExportRows: MAX_EXPORT_ROWS,
      },
    };
  });

  // ─── POST /export/assignments — export assignments to Google Sheet ─
  fastify.post(
    "/export/assignments",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          properties: {
            dateRange: {
              type: "object",
              properties: {
                from: { type: "string", format: "date" },
                to: { type: "string", format: "date" },
              },
              required: ["from", "to"],
            },
            wellIds: {
              type: "array",
              items: { type: "integer" },
            },
            statuses: {
              type: "array",
              items: { type: "string" },
            },
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

      const body = (request.body ?? {}) as {
        dateRange?: { from: string; to: string };
        wellIds?: number[];
        statuses?: string[];
      };

      const filters: ExportFilters = {};
      if (body.dateRange) {
        filters.dateRange = {
          from: new Date(body.dateRange.from),
          to: new Date(body.dateRange.to),
        };
      }
      if (body.wellIds) {
        filters.wellIds = body.wellIds;
      }
      if (body.statuses) {
        filters.statuses = body.statuses;
      }

      const result = await exportAssignments(db, filters);
      return { success: true, data: result };
    },
  );

  // ─── POST /export/wells — export wells to Google Sheet ────────────
  fastify.post(
    "/export/wells",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          properties: {
            wellIds: {
              type: "array",
              items: { type: "integer" },
            },
            statuses: {
              type: "array",
              items: { type: "string" },
            },
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

      const body = (request.body ?? {}) as {
        wellIds?: number[];
        statuses?: string[];
      };

      const filters: ExportFilters = {};
      if (body.wellIds) {
        filters.wellIds = body.wellIds;
      }
      if (body.statuses) {
        filters.statuses = body.statuses;
      }

      const result = await exportWells(db, filters);
      return { success: true, data: result };
    },
  );

  // ─── POST /import/preview — preview import with column mapping ────
  fastify.post(
    "/import/preview",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["spreadsheetId", "sheetName", "columnMap"],
          properties: {
            spreadsheetId: { type: "string", minLength: 1 },
            sheetName: { type: "string", minLength: 1 },
            columnMap: { type: "object" },
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

      const { spreadsheetId, sheetName, columnMap } = request.body as {
        spreadsheetId: string;
        sheetName: string;
        columnMap: ColumnMap;
      };

      const result = await previewImport(
        db,
        spreadsheetId,
        sheetName,
        columnMap,
      );
      return { success: true, data: result };
    },
  );

  // ─── POST /import/execute — execute import (create loads + assignments) ─
  fastify.post(
    "/import/execute",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["previewData"],
          properties: {
            previewData: { type: "object" },
            options: {
              type: "object",
              properties: {
                defaultWellId: { type: "integer" },
                dryRun: { type: "boolean" },
              },
            },
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

      const { previewData, options: reqOptions } = request.body as {
        previewData: PreviewResult;
        options?: { defaultWellId?: number; dryRun?: boolean };
      };

      const user = request.user as { id: number; name: string };
      const importOptions: ImportOptions = {
        userId: user.id,
        userName: user.name,
        defaultWellId: reqOptions?.defaultWellId,
        dryRun: reqOptions?.dryRun,
      };

      const result = await executeImport(db, previewData, importOptions);
      return { success: true, data: result };
    },
  );

  // ─── POST /sync/trigger — manual sync trigger ────────────────────
  fastify.post(
    "/sync/trigger",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
    },
    async (_request, _reply) => {
      // Stub — sync trigger for scheduled sheet operations.
      // Full implementation depends on sync config and cron infrastructure.
      return {
        success: true,
        data: {
          message: "Sheets sync triggered",
          triggeredAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── GET /sync/config — get sync configuration from env ──────────
  fastify.get(
    "/sync/config",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, _reply) => {
      return {
        success: true,
        data: {
          enabled: process.env.SHEETS_SYNC_ENABLED === "true",
          intervalMinutes: parseInt(
            process.env.SHEETS_SYNC_INTERVAL_MINUTES ?? "60",
            10,
          ),
          spreadsheetId: process.env.SHEETS_SYNC_SPREADSHEET_ID ?? null,
          sheetName: process.env.SHEETS_SYNC_SHEET_NAME ?? null,
        },
      };
    },
  );

  // ─── PUT /sync/config — update sync configuration ────────────────
  fastify.put(
    "/sync/config",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            intervalMinutes: { type: "integer", minimum: 1 },
            spreadsheetId: { type: "string" },
            sheetName: { type: "string" },
          },
        },
      },
    },
    async (_request, _reply) => {
      // Stub — sync config updates require persistent config store.
      // For now, config is read-only from env vars.
      // Future: write to a settings table or config file.
      return {
        success: true,
        data: {
          message:
            "Sync config update noted. Currently config is read from environment variables only.",
          updatedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ─── GET /drive/list — list accessible Google Sheets ──────────────
  fastify.get(
    "/drive/list",
    {
      preHandler: [fastify.authenticate],
    },
    async (_request, _reply) => {
      const auth = await getGoogleAuth();
      const sheets = await listAccessibleSheets(auth);
      return {
        success: true,
        data: sheets,
        meta: { total: sheets.length },
      };
    },
  );

  // ─── GET /inspect — recon a single spreadsheet (tabs + headers + sample) ─
  fastify.get(
    "/inspect",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        querystring: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 10 },
            sample: { type: "integer", minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id, sample } = request.query as {
        id: string;
        sample?: number;
      };
      try {
        const result = await inspectSheet(id, sample ?? 10);
        return { success: true, data: result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({
          success: false,
          error: { code: "SHEET_INSPECT_FAILED", message },
        });
      }
    },
  );

  // ─── GET /reconciliation — compare Sheets vs system data ─────────
  fastify.get(
    "/reconciliation",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
    },
    async (_request, _reply) => {
      // Stub — reconciliation compares sheet data with system data.
      // Full implementation requires a target spreadsheet and field mapping.
      return {
        success: true,
        data: {
          status: "stub",
          message:
            "Reconciliation endpoint ready. Configure a target spreadsheet to compare.",
          comparison: [],
        },
      };
    },
  );

  // ─── POST /validate-from-sheet — cross-reference sheet for bulk validation ─
  fastify.post(
    "/validate-from-sheet",
    {
      preHandler: [
        fastify.authenticate,
        fastify.requireRole(["admin", "dispatcher"]),
      ],
      schema: {
        body: {
          type: "object",
          required: ["spreadsheetId", "sheetName", "columnMap"],
          properties: {
            spreadsheetId: { type: "string", minLength: 1 },
            sheetName: { type: "string", minLength: 1 },
            columnMap: { type: "object" },
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

      const { spreadsheetId, sheetName, columnMap } = request.body as {
        spreadsheetId: string;
        sheetName: string;
        columnMap: ColumnMap;
      };
      const user = request.user as { id: number };

      const result = await validateFromSheet(
        db,
        spreadsheetId,
        sheetName,
        columnMap,
        user.id,
      );
      return {
        success: true,
        data: result,
        meta: {
          summary: `${result.matched} validated, ${result.alreadyValidated} already done, ${result.unmatched} not found`,
        },
      };
    },
  );

  // ─── POST /loadcount/sync — pull Current+Previous tabs into snapshots ─
  fastify.post(
    "/loadcount/sync",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
      schema: {
        body: {
          type: "object",
          properties: {
            tabs: { type: "array", items: { type: "string" } },
            sampleRows: { type: "integer", minimum: 1, maximum: 100 },
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
      const body = (request.body ?? {}) as {
        tabs?: string[];
        sampleRows?: number;
      };
      try {
        const result = await syncLoadCountSheet(db, {
          tabs: body.tabs,
          sampleRows: body.sampleRows,
        });
        return { success: true, data: result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({
          success: false,
          error: { code: "SHEET_SYNC_FAILED", message },
        });
      }
    },
  );

  // ─── GET /loadcount/parity — sheet vs v2 weekly parity report ─────
  fastify.get(
    "/loadcount/parity",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
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
      try {
        const rows = await computeWeekParity(db);
        return {
          success: true,
          data: rows,
          meta: {
            spreadsheetId: LOAD_COUNT_SHEET_ID,
            weeksReported: rows.length,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({
          success: false,
          error: { code: "PARITY_COMPUTE_FAILED", message },
        });
      }
    },
  );

  // ─── GET /health — Sheets connectivity check ─────────────────────
  fastify.get("/health", async (_request, _reply) => {
    const diag = diagnostics();
    const authCheck = diag.checks.find((c) => c.name === "auth-configured");

    let googleReachable = false;
    if (authCheck?.ok) {
      try {
        await getGoogleAuth();
        googleReachable = true;
      } catch {
        googleReachable = false;
      }
    }

    return {
      success: true,
      data: {
        authConfigured: authCheck?.ok ?? false,
        googleReachable,
        diagnostics: diag.status,
        stats: {
          totalExports: diag.stats.totalExports,
          totalImports: diag.stats.totalImports,
        },
        checkedAt: new Date().toISOString(),
      },
    };
  });
};

export default sheetsRoutes;
