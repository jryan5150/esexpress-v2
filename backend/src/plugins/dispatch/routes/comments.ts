import { type FastifyPluginAsync } from "fastify";
import {
  listComments,
  addComment,
  deleteComment,
} from "../services/load-comments.service.js";
import { AppError } from "../../../lib/errors.js";

const commentRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /loads/:loadId/comments — list all comments for a load, newest first
  fastify.get(
    "/:loadId/comments",
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
      const { loadId } = request.params as { loadId: number };
      try {
        const data = await listComments(db, loadId);
        return { success: true, data, meta: { count: data.length } };
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    },
  );

  // POST /loads/:loadId/comments — add a comment to a load
  fastify.post(
    "/:loadId/comments",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["loadId"],
          properties: { loadId: { type: "integer" } },
        },
        body: {
          type: "object",
          required: ["body"],
          properties: {
            body: { type: "string", minLength: 1, maxLength: 10000 },
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
      const { loadId } = request.params as { loadId: number };
      const { body } = request.body as { body: string };
      const user = (request as any).user as {
        id: number;
        name: string;
        role: "admin" | "builder" | "finance" | "viewer";
      };
      try {
        const comment = await addComment(
          db,
          loadId,
          { body },
          { userId: user.id, userName: user.name, role: user.role },
        );
        return reply.status(201).send({
          success: true,
          data: {
            id: comment.id,
            loadId: comment.loadId,
            authorUserId: comment.authorUserId,
            authorName: comment.authorName,
            body: comment.body,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
          },
        });
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    },
  );

  // DELETE /loads/:loadId/comments/:commentId — delete a comment (author or admin only)
  fastify.delete(
    "/:loadId/comments/:commentId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["loadId", "commentId"],
          properties: {
            loadId: { type: "integer" },
            commentId: { type: "integer" },
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
      const { commentId } = request.params as {
        loadId: number;
        commentId: number;
      };
      const user = (request as any).user as {
        id: number;
        name: string;
        role: "admin" | "builder" | "finance" | "viewer";
      };
      try {
        const result = await deleteComment(db, commentId, {
          userId: user.id,
          userName: user.name,
          role: user.role,
        });
        return { success: true, data: result };
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    },
  );
};

export { commentRoutes };
