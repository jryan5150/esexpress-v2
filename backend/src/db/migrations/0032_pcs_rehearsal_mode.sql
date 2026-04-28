-- 2026-04-28: PCS rehearsal mode infrastructure.
--
-- app_settings already exists (created 2026-04-22 in 0024). We just
-- seed the new pcs_dispatch_mode key. Default 'rehearsal' so Jess can
-- run the workflow end-to-end during dual-run without waiting on Kyle.
-- When OAuth lands:
--   UPDATE app_settings SET value = 'live' WHERE key = 'pcs_dispatch_mode';
-- Then run backend/scripts/drain-pending-pcs.ts to push every queued
-- pending row.
--
-- Adds assignments.pcs_pending_at — set when a Push to PCS click is
-- captured in rehearsal mode; drained NULL when the cutover script
-- flips the load to a real PCS push and pcsNumber gets populated.

INSERT INTO "app_settings" ("key", "value", "description")
VALUES (
  'pcs_dispatch_mode',
  'rehearsal',
  'live = call PCS REST on Push to PCS clicks. rehearsal = mark assignments as pcs_pending_at + advance stage to entered, no PCS call. Flip to live when Kyle delivers OAuth + the bulk drain script runs.'
)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "assignments"
  ADD COLUMN IF NOT EXISTS "pcs_pending_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_assignments_pcs_pending_at"
  ON "assignments" ("pcs_pending_at");
