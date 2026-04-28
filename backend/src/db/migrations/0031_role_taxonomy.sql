-- 2026-04-28: Role taxonomy lock — admin / builder / finance / viewer
--
-- Drops dispatcher, adds builder + finance. Migrates existing data so
-- nothing breaks: every dispatcher row becomes builder. Default role
-- on new accounts stays viewer.
--
-- The role column is text (not a PG enum), so this is a pure UPDATE +
-- there's no enum DDL to coordinate.

-- 1. Migrate existing data
UPDATE "users"
SET "role" = 'builder'
WHERE "role" = 'dispatcher';

UPDATE "invited_emails"
SET "role" = 'builder'
WHERE "role" = 'dispatcher';

-- 2. Default for invited_emails was 'dispatcher' historically; bump
--    to 'builder' for any rows that still have NULL or stale defaults.
UPDATE "invited_emails"
SET "role" = 'builder'
WHERE "role" IS NULL;
