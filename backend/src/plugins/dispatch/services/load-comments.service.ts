import { eq, desc } from "drizzle-orm";
import { loadComments, loads } from "../../../db/schema.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../../lib/errors.js";
import type { Database } from "../../../db/client.js";

export interface CommentAuthorContext {
  userId: number;
  userName: string;
  role: "admin" | "builder" | "finance" | "viewer";
}

export interface AddCommentInput {
  body: string;
}

/**
 * List all comments for a load, newest first.
 */
export async function listComments(db: Database, loadId: number) {
  // Verify the load exists first for a clean 404.
  const [load] = await db
    .select({ id: loads.id })
    .from(loads)
    .where(eq(loads.id, loadId))
    .limit(1);
  if (!load) throw new NotFoundError("Load", loadId);

  return db
    .select()
    .from(loadComments)
    .where(eq(loadComments.loadId, loadId))
    .orderBy(desc(loadComments.createdAt));
}

/**
 * Add a comment to a load. Author metadata is populated from the authenticated user.
 */
export async function addComment(
  db: Database,
  loadId: number,
  input: AddCommentInput,
  ctx: CommentAuthorContext,
) {
  const trimmed = (input.body ?? "").trim();
  if (!trimmed) {
    throw new ValidationError("Comment body cannot be empty");
  }

  // Ensure the load exists; FK would also catch this but this yields a clean 404.
  const [load] = await db
    .select({ id: loads.id })
    .from(loads)
    .where(eq(loads.id, loadId))
    .limit(1);
  if (!load) throw new NotFoundError("Load", loadId);

  const [comment] = await db
    .insert(loadComments)
    .values({
      loadId,
      authorUserId: ctx.userId,
      authorName: ctx.userName,
      body: trimmed,
    })
    .returning();

  return comment;
}

/**
 * Delete a comment. Only the original author OR a user with role='admin' may delete.
 */
export async function deleteComment(
  db: Database,
  commentId: number,
  ctx: CommentAuthorContext,
) {
  const [comment] = await db
    .select()
    .from(loadComments)
    .where(eq(loadComments.id, commentId))
    .limit(1);

  if (!comment) throw new NotFoundError("Comment", commentId);

  const isAuthor =
    comment.authorUserId !== null && comment.authorUserId === ctx.userId;
  const isAdmin = ctx.role === "admin";
  if (!isAuthor && !isAdmin) {
    throw new ForbiddenError(
      "Only the comment author or an admin may delete this comment",
    );
  }

  await db.delete(loadComments).where(eq(loadComments.id, commentId));
  return { id: commentId, deleted: true };
}
