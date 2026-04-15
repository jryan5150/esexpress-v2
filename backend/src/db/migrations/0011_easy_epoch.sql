ALTER TABLE "assignments" ADD COLUMN "handler_stage" text DEFAULT 'uncertain' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "current_handler_id" integer;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "uncertain_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "entered_on" date;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "pickup_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "delivery_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_current_handler_id_users_id_fk" FOREIGN KEY ("current_handler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignments_handler_stage" ON "assignments" USING btree ("handler_stage");--> statement-breakpoint
CREATE INDEX "idx_assignments_current_handler" ON "assignments" USING btree ("current_handler_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_entered_on" ON "assignments" USING btree ("entered_on");
--> statement-breakpoint
-- Backfill handler_stage from existing assignment state.
-- Rules (preserve user-visible progress, but re-require build step for clean v5 state):
--   1. assignments with status IN ('completed','cancelled','failed') → 'cleared'
--   2. assignments with photo_status != 'missing' AND auto_map_tier = 1 AND status = 'pending' → 'ready_to_build'
--   3. everything else → 'uncertain' (safe default — appears on Jessica's sweep)
UPDATE "assignments"
SET "handler_stage" = 'cleared',
    "stage_changed_at" = COALESCE("updated_at", now())
WHERE "handler_stage" = 'uncertain'
  AND "status" IN ('completed','cancelled','failed');
--> statement-breakpoint
UPDATE "assignments"
SET "handler_stage" = 'ready_to_build',
    "stage_changed_at" = COALESCE("updated_at", now())
WHERE "handler_stage" = 'uncertain'
  AND "photo_status" != 'missing'
  AND "auto_map_tier" = 1
  AND "status" = 'pending';
--> statement-breakpoint
-- Seed uncertain_reasons for remaining 'uncertain' rows based on existing flags.
UPDATE "assignments" a
SET "uncertain_reasons" = (
  SELECT COALESCE(jsonb_agg(reason), '[]'::jsonb)
  FROM (
    SELECT 'unassigned_well'::text AS reason WHERE a."well_id" IS NULL
    UNION ALL
    SELECT 'no_photo_48h' WHERE a."photo_status" = 'missing'
    UNION ALL
    SELECT 'fuzzy_match' WHERE a."auto_map_tier" IS NOT NULL AND a."auto_map_tier" > 1
  ) reasons
)
WHERE a."handler_stage" = 'uncertain';
--> statement-breakpoint
-- Populate pickup_state / delivery_state from existing load status where obvious.
UPDATE "loads"
SET "delivery_state" = 'complete'
WHERE "delivered_on" IS NOT NULL;