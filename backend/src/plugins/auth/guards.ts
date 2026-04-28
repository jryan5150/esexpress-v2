import fp from "fastify-plugin";
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from "fastify";
import { UnauthorizedError, ForbiddenError } from "../../lib/errors.js";
import type { JwtPayload } from "../../types/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    requireRole: (
      roles: string[],
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// @fastify/jwt exposes request.user via its FastifyJWT interface — augment
// its `user` type rather than FastifyRequest directly. Trying to override
// FastifyRequest.user conflicts with @fastify/jwt's own declaration.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: JwtPayload;
  }
}

/**
 * Single-operator allowlist gate.
 *
 * When `MAINTENANCE_ALLOW_EMAILS` is set (comma-separated), authenticated
 * users whose email is NOT in the list get a 403 with code
 * `MAINTENANCE_MODE`. This is the "soft maintenance" mode used during
 * focused validation / single-operator periods — site stays up, login
 * still works, but only the listed operators see the app behind it.
 *
 * Set the env var to enable; unset (or empty) = open to all authenticated
 * users (default behavior). Comparison is case-insensitive + trims
 * whitespace per address. Format: `email1@x.com,email2@y.com`.
 *
 * Recorded for audit: every blocked attempt logs the requested URL +
 * the email that was rejected.
 */
function parseMaintenanceAllowlist(): Set<string> {
  const raw = process.env.MAINTENANCE_ALLOW_EMAILS;
  if (!raw || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

const guardsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        const payload = await request.jwtVerify<JwtPayload>();
        request.user = payload;
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }

      // Server-side session invalidation. When users.tokens_invalidated_at
      // is set and is newer than the JWT's iat, force the user to
      // re-authenticate. Used to push WhatsNew / release content without
      // waiting for natural 24h JWT expiry. Cheap query — single row by
      // PK with a small projection.
      const db = fastify.db;
      if (db && request.user.id) {
        try {
          const { sql } = await import("drizzle-orm");
          const rows = (await db.execute(sql`
            SELECT tokens_invalidated_at::text AS tia
            FROM users WHERE id = ${request.user.id}
            LIMIT 1
          `)) as unknown as Array<{ tia: string | null }>;
          const tia = rows[0]?.tia;
          if (tia && (request.user as { iat?: number }).iat) {
            const invalidatedMs = new Date(tia).getTime();
            const issuedMs =
              ((request.user as { iat?: number }).iat ?? 0) * 1000;
            if (issuedMs < invalidatedMs) {
              request.log.info(
                { userId: request.user.id, issuedMs, invalidatedMs },
                "[force-relogin] rejecting JWT older than user's invalidation timestamp",
              );
              return reply.status(401).send({
                success: false,
                error: {
                  code: "TOKEN_INVALIDATED",
                  message:
                    "Your session was invalidated to load new content. Please sign in again.",
                },
              });
            }
          }
        } catch (err) {
          // Don't fail-closed on a token-invalidation lookup failure —
          // logging only. The natural JWT expiry still applies.
          request.log.warn(
            { err, userId: request.user.id },
            "[force-relogin] tokens_invalidated_at lookup failed",
          );
        }
      }

      // Soft maintenance gate. Active only when MAINTENANCE_ALLOW_EMAILS
      // is set; otherwise this is a no-op.
      const allowlist = parseMaintenanceAllowlist();
      if (allowlist.size > 0) {
        const email = (request.user.email ?? "").toLowerCase();
        if (!allowlist.has(email)) {
          request.log.info(
            { email, url: request.url, allowlist: [...allowlist] },
            "[maintenance-gate] blocked authenticated user",
          );
          return reply.status(403).send({
            success: false,
            error: {
              code: "MAINTENANCE_MODE",
              message:
                "ES Express v2 is in single-operator validation mode. Access will reopen shortly.",
            },
          });
        }
      }
    },
  );

  fastify.decorate("requireRole", function (roles: string[]) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.user) {
        throw new UnauthorizedError("Authentication required");
      }
      if (!roles.includes(request.user.role)) {
        throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
      }
    };
  });
};

export default fp(guardsPlugin, { name: "guards", dependencies: ["jwt"] });
