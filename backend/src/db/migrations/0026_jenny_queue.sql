-- Add job_category to loads — Jenny's Queue (sheet's "Other Jobs to be
-- Invoiced" section). Default 'standard' = the common case (well-bound
-- load). Non-standard categories: truck_pusher, equipment_move, flatbed,
-- frac_chem, finoric, joetex, panel_truss, other.
--
-- See docs/2026-04-25-canonical-vocabulary.md role #14 for the source on
-- why this category exists in the team's mental model.

ALTER TABLE "loads" ADD COLUMN "job_category" text NOT NULL DEFAULT 'standard';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_loads_job_category" ON "loads" ("job_category") WHERE "job_category" <> 'standard';
