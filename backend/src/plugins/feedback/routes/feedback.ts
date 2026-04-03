import { type FastifyPluginAsync } from "fastify";

function requirePin(pin: string | undefined): boolean {
  const expected = process.env.DASHBOARD_PIN;
  if (!expected) return false;
  return pin === expected;
}

const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  // POST / — submit feedback (JWT auth — dispatch users)
  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["category", "description"],
          properties: {
            category: {
              type: "string",
              enum: ["issue", "question", "suggestion"],
            },
            description: { type: "string", minLength: 3 },
            pageUrl: { type: "string" },
            routeName: { type: "string" },
            screenshotUrl: { type: "string" },
            breadcrumbs: { type: "array" },
            sessionSummary: { type: "object" },
            browser: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const db = fastify.db;
      if (!db)
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });

      const { feedback } = await import("../../../db/schema.js");
      const user = request.user as { id: number };
      const body = request.body as Record<string, unknown>;

      const [row] = await db
        .insert(feedback)
        .values({
          userId: user.id,
          category: body.category as "issue" | "question" | "suggestion",
          description: body.description as string,
          pageUrl: (body.pageUrl as string) || null,
          routeName: (body.routeName as string) || null,
          screenshotUrl: (body.screenshotUrl as string) || null,
          breadcrumbs:
            (body.breadcrumbs as Array<Record<string, unknown>>) || [],
          sessionSummary: body.sessionSummary || null,
          browser: body.browser || null,
        })
        .returning();

      return { success: true, data: { id: row.id } };
    },
  );

  // POST /screenshot — upload screenshot (JWT auth)
  fastify.post(
    "/screenshot",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { base64 } = request.body as { base64: string };
      if (!base64)
        return reply.status(400).send({
          success: false,
          error: { code: "BAD_REQUEST", message: "base64 field required" },
        });

      const user = request.user as { id: number };
      const { uploadScreenshot } =
        await import("../services/screenshot.service.js");
      const url = await uploadScreenshot(base64, user.id);
      return { success: true, data: { url } };
    },
  );

  // GET / — list feedback (PIN auth — dashboard)
  fastify.get("/", async (request, reply) => {
    const pin = (request.headers as Record<string, string>)["x-dashboard-pin"];
    if (!requirePin(pin))
      return reply.status(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid PIN" },
      });

    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const { feedback, users } = await import("../../../db/schema.js");
    const { desc, eq } = await import("drizzle-orm");

    const query = request.query as {
      category?: string;
      limit?: string;
      offset?: string;
    };
    const limit = Math.min(parseInt(query.limit || "20"), 100);
    const offset = parseInt(query.offset || "0");

    const rows = await db
      .select({
        id: feedback.id,
        category: feedback.category,
        description: feedback.description,
        pageUrl: feedback.pageUrl,
        routeName: feedback.routeName,
        screenshotUrl: feedback.screenshotUrl,
        createdAt: feedback.createdAt,
        userName: users.name,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset);

    return { success: true, data: rows };
  });

  // GET /:id — single feedback with full breadcrumbs (PIN auth)
  fastify.get("/:id", async (request, reply) => {
    const pin = (request.headers as Record<string, string>)["x-dashboard-pin"];
    if (!requirePin(pin))
      return reply.status(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid PIN" },
      });

    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const { feedback, users } = await import("../../../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .where(eq(feedback.id, parseInt(id)))
      .limit(1);

    if (!row)
      return reply.status(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Feedback not found" },
      });
    return {
      success: true,
      data: { ...row.feedback, userName: row.users?.name },
    };
  });

  // GET /stats — category counts + daily submissions (PIN auth)
  fastify.get("/stats", async (request, reply) => {
    const pin = (request.headers as Record<string, string>)["x-dashboard-pin"];
    if (!requirePin(pin))
      return reply.status(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid PIN" },
      });

    const db = fastify.db;
    if (!db)
      return reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not connected",
        },
      });

    const { feedback } = await import("../../../db/schema.js");
    const { count, gte, sql } = await import("drizzle-orm");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const byCat = await db
      .select({ category: feedback.category, count: count() })
      .from(feedback)
      .groupBy(feedback.category);

    const daily = await db
      .select({
        day: sql<string>`date_trunc('day', ${feedback.createdAt})::text`,
        count: count(),
      })
      .from(feedback)
      .where(gte(feedback.createdAt, weekAgo))
      .groupBy(sql`date_trunc('day', ${feedback.createdAt})`)
      .orderBy(sql`date_trunc('day', ${feedback.createdAt})`);

    return {
      success: true,
      data: {
        byCategory: Object.fromEntries(byCat.map((r) => [r.category, r.count])),
        daily,
      },
    };
  });
};

export default feedbackRoutes;
