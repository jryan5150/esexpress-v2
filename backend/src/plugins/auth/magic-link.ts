/**
 * Magic-Link Authentication Routes
 * ================================
 *
 *   POST /api/v1/auth/request-magic-link
 *     Body: { email }
 *     Behavior:
 *       - Always returns 200 with a generic message (don't leak which emails
 *         exist — classic user-enumeration protection).
 *       - If email maps to a real user: generate token, insert row, email link.
 *       - Rate limit: 3 requests/hour/email (counted from magic_link_tokens).
 *
 *   GET /api/v1/auth/magic-link/verify/:token
 *     Behavior:
 *       - Lookup token; verify not expired, not used.
 *       - If valid: mark used, issue JWT, 302 redirect to
 *         {PUBLIC_APP_URL}/magic-link?token=<jwt> so the frontend can store it
 *         in localStorage the same way password login does.
 *       - If invalid: 302 redirect to {PUBLIC_APP_URL}/login?error=magic_link_<reason>.
 *
 * Why query-param JWT instead of cookie: existing login flow (use-auth.ts)
 * stores the JWT in localStorage under "esexpress-token". Matching that
 * avoids introducing a second auth-state source. The landing page extracts
 * and stores it immediately.
 */

import { randomBytes } from "node:crypto";
import { and, eq, gt, gte, isNull } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { magicLinkTokens, users } from "../../db/schema.js";
import { sendEmail } from "../notifications/services/notifications.service.js";
import { renderMagicLinkEmail } from "../notifications/templates/magic-link.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOKEN_TTL_MINUTES = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3;

// Generic response — identical whether user exists or not.
const GENERIC_SUCCESS_MESSAGE =
  "If this email is on your account, we've sent you a sign-in link. Check your inbox (it expires in 15 minutes).";

// ---------------------------------------------------------------------------
// Helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Generate a 32-byte crypto-random hex token (64 chars). */
export function generateMagicToken(): string {
  return randomBytes(32).toString("hex");
}

/** Resolve the public-facing app URL for emails / redirects. */
export function getPublicAppUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.FRONTEND_URL ??
    "https://app.esexpressllc.com"
  );
}

/** Resolve the API base URL that should appear IN the emailed magic link. */
export function getPublicApiUrl(): string {
  return (
    process.env.PUBLIC_API_URL ??
    process.env.API_URL ??
    "https://api.esexpressllc.com"
  );
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const magicLinkRoutes: FastifyPluginAsync = async (fastify) => {
  // ────────────────────────────────────────────────────────────────
  // POST /request-magic-link
  // ────────────────────────────────────────────────────────────────
  fastify.post(
    "/request-magic-link",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const normalized = email.trim().toLowerCase();

      const db = fastify.db;
      if (!db) {
        reply.status(503);
        return {
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database not connected",
          },
        };
      }

      // Rate limit check — count recent requests for this email.
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
      const recent = await db
        .select({ id: magicLinkTokens.id })
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.email, normalized),
            gte(magicLinkTokens.createdAt, since),
          ),
        );

      if (recent.length >= RATE_LIMIT_MAX) {
        // Still return the generic success so attackers can't use the rate
        // limit to enumerate emails. Log server-side for visibility.
        request.log.warn(
          { email: normalized, recent: recent.length },
          "magic-link rate limit hit",
        );
        return {
          success: true,
          data: { message: GENERIC_SUCCESS_MESSAGE },
        };
      }

      // Lookup user (case-insensitive via normalized email).
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1);

      if (!user) {
        // Email doesn't exist — return generic success anyway.
        request.log.info(
          { email: normalized },
          "magic-link requested for unknown email",
        );
        return {
          success: true,
          data: { message: GENERIC_SUCCESS_MESSAGE },
        };
      }

      // Generate + persist token.
      const token = generateMagicToken();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);
      const ip = request.ip;

      await db.insert(magicLinkTokens).values({
        token,
        userId: user.id,
        email: normalized,
        expiresAt,
        requestedFromIp: ip,
      });

      // Build + send email.
      const link = `${getPublicApiUrl()}/api/v1/auth/magic-link/verify/${token}`;
      const { subject, html } = renderMagicLinkEmail({
        name: user.name,
        link,
        expiresInMinutes: TOKEN_TTL_MINUTES,
      });

      const sendResult = await sendEmail(db, {
        to: user.email,
        subject,
        body: html,
        eventType: "magic_link",
        metadata: {
          userId: user.id,
          ip,
          tokenPrefix: token.slice(0, 8), // for audit joins without leaking the secret
        },
      });

      if (!sendResult.success) {
        // Log but still return generic success — don't leak infra errors
        // to the caller.
        request.log.error(
          { email: normalized, error: sendResult.error },
          "magic-link email send failed",
        );
      }

      return {
        success: true,
        data: { message: GENERIC_SUCCESS_MESSAGE },
      };
    },
  );

  // ────────────────────────────────────────────────────────────────
  // GET /magic-link/verify/:token
  // ────────────────────────────────────────────────────────────────
  fastify.get(
    "/magic-link/verify/:token",
    {
      schema: {
        params: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", minLength: 32, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const appUrl = getPublicAppUrl();

      const db = fastify.db;
      if (!db) {
        return reply.redirect(`${appUrl}/login?error=service_unavailable`);
      }

      // Lookup unused, unexpired token.
      const now = new Date();
      const [row] = await db
        .select({
          id: magicLinkTokens.id,
          userId: magicLinkTokens.userId,
          email: magicLinkTokens.email,
          expiresAt: magicLinkTokens.expiresAt,
          usedAt: magicLinkTokens.usedAt,
        })
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.token, token),
            gt(magicLinkTokens.expiresAt, now),
            isNull(magicLinkTokens.usedAt),
          ),
        )
        .limit(1);

      if (!row || row.userId === null) {
        // Diagnose (without leaking) whether it's expired/used/nonexistent.
        const [any] = await db
          .select({
            usedAt: magicLinkTokens.usedAt,
            expiresAt: magicLinkTokens.expiresAt,
          })
          .from(magicLinkTokens)
          .where(eq(magicLinkTokens.token, token))
          .limit(1);

        let reason = "invalid";
        if (any) {
          if (any.usedAt) reason = "used";
          else if (any.expiresAt <= now) reason = "expired";
        }
        return reply.redirect(`${appUrl}/login?error=magic_link_${reason}`);
      }

      // Mark token used (race-safe: only flip if still null).
      const updated = await db
        .update(magicLinkTokens)
        .set({ usedAt: now })
        .where(
          and(eq(magicLinkTokens.id, row.id), isNull(magicLinkTokens.usedAt)),
        )
        .returning({ id: magicLinkTokens.id });

      if (updated.length === 0) {
        // Someone else used it between SELECT and UPDATE.
        return reply.redirect(`${appUrl}/login?error=magic_link_used`);
      }

      // Load the user to construct the JWT payload.
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1);

      if (!user) {
        return reply.redirect(`${appUrl}/login?error=magic_link_user_missing`);
      }

      // Update last-login timestamp (same as password-login flow).
      await db
        .update(users)
        .set({ lastLoginAt: now })
        .where(eq(users.id, user.id));

      const jwt = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      // Redirect to frontend landing page with JWT in query. Landing page
      // stores to localStorage under "esexpress-token" then navigates to /.
      return reply.redirect(
        `${appUrl}/magic-link?token=${encodeURIComponent(jwt)}`,
      );
    },
  );
};

export default magicLinkRoutes;
