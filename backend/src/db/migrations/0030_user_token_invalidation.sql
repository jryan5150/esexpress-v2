-- 2026-04-28: server-side JWT invalidation per user. When set on a user
-- row, the authenticate guard rejects any JWT whose `iat` is older
-- than this timestamp — forcing a fresh login on the user's next
-- request. Used to push release/WhatsNew content without relying on
-- natural 24h JWT expiry.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokens_invalidated_at"
  timestamp with time zone;
