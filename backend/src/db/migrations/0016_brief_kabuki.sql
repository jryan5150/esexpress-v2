-- app_settings: key/value feature-flag + config store.
-- Created 2026-04-22 to make PCS_DISPATCH_ENABLED and similar flippable
-- via admin UI without env-var edits. Idempotent (IF NOT EXISTS) so it
-- safely re-runs if the prior migration already populated tables.
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"description" text,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "app_settings"
    ADD CONSTRAINT "app_settings_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- Seed the PCS dispatch flag. Initial value 'false' — admin flips via UI.
INSERT INTO "app_settings" (key, value, description)
VALUES (
  'pcs_dispatch_enabled',
  'false',
  'Master switch for pushing loads to PCS. When true, Validate action routes loads to PCS.'
)
ON CONFLICT (key) DO NOTHING;
