import { type FastifyPluginAsync } from "fastify";

// In-memory presence store (single-instance deployment)
interface UserPresence {
  userId: number;
  userName: string;
  currentPage: string;
  wellId: number | null;
  wellName: string | null;
  assignmentId: number | null;
  lastSeen: number; // epoch ms
}

const presence = new Map<number, UserPresence>();
const STALE_MS = 60_000; // 60 seconds without heartbeat = offline

function cleanStale() {
  const now = Date.now();
  for (const [id, p] of presence) {
    if (now - p.lastSeen > STALE_MS) presence.delete(id);
  }
}

const presenceRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /presence/heartbeat — update current user's location
  fastify.post(
    "/heartbeat",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            currentPage: { type: "string" },
            wellId: { type: ["integer", "null"] },
            wellName: { type: ["string", "null"] },
            assignmentId: { type: ["integer", "null"] },
          },
        },
      },
    },
    async (request) => {
      const user = request.user as { id: number; name: string };
      const { currentPage, wellId, wellName, assignmentId } =
        (request.body as any) ?? {};

      presence.set(user.id, {
        userId: user.id,
        userName: user.name,
        currentPage: currentPage ?? "unknown",
        wellId: wellId ?? null,
        wellName: wellName ?? null,
        assignmentId: assignmentId ?? null,
        lastSeen: Date.now(),
      });

      return { success: true };
    },
  );

  // GET /presence — get all online users
  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async () => {
      cleanStale();
      const users = Array.from(presence.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
        currentPage: p.currentPage,
        wellId: p.wellId,
        wellName: p.wellName,
        assignmentId: p.assignmentId,
        lastSeen: new Date(p.lastSeen).toISOString(),
      }));

      return { success: true, data: users };
    },
  );
};

export { presenceRoutes };
