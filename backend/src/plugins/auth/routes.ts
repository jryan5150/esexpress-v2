import { type FastifyPluginAsync } from "fastify";
import magicLinkRoutes from "./magic-link.js";

const authRoutes: FastifyPluginAsync = async (fastify) => {

  // Magic-link endpoints: POST /request-magic-link, GET /magic-link/verify/:token
  await fastify.register(magicLinkRoutes);

  // POST /auth/login — local email/password login (stricter rate limit)
  fastify.post(
    "/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 1 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  token: { type: "string" },
                  user: {
                    type: "object",
                    properties: {
                      id: { type: "number" },
                      email: { type: "string" },
                      name: { type: "string" },
                      role: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      const { verifyPassword } = await import("./service.js");

      // Database lookup — requires db decorated on app
      const db = fastify.db;
      if (!db) {
        return (reply as any).status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }

      const { eq } = await import("drizzle-orm");
      const { users } = await import("../../db/schema.js");

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user || !user.passwordHash) {
        return (reply as any).status(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
        });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return (reply as any).status(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
        });
      }

      // Update last login
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      return {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      };
    },
  );

  // GET /auth/me — get current user from token
  fastify.get(
    "/me",
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  email: { type: "string" },
                  name: { type: "string" },
                  role: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      return {
        success: true,
        data: request.user,
      };
    },
  );

  // GET /auth/users — list all users (admin only)
  fastify.get(
    "/users",
    {
      preHandler: [fastify.authenticate, fastify.requireRole(["admin"])],
    },
    async (_request, reply) => {
      const db = fastify.db;
      if (!db) {
        return (reply as any).status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        });
      }

      const { users } = await import("../../db/schema.js");
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.name);

      return { success: true, data: rows };
    },
  );
};

export default authRoutes;
