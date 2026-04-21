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

const guardsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, _reply: FastifyReply) {
      try {
        const payload = await request.jwtVerify<JwtPayload>();
        request.user = payload;
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
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
