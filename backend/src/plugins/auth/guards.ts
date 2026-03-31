import { type FastifyPluginAsync, type FastifyRequest, type FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../../lib/errors.js';
import type { JwtPayload } from '../../types/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

const guardsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async function (request: FastifyRequest, _reply: FastifyReply) {
    try {
      const payload = await request.jwtVerify<JwtPayload>();
      request.user = payload;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  });

  fastify.decorate('requireRole', function (roles: string[]) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      if (!roles.includes(request.user.role)) {
        throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
      }
    };
  });
};

// Break Fastify encapsulation so decorators are available on root instance
(guardsPlugin as { [key: symbol]: unknown })[Symbol.for('skip-override')] = true;

export default guardsPlugin;
