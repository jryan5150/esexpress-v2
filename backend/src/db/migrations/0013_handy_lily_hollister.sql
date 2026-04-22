CREATE TABLE "data_integrity_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"script_name" text NOT NULL,
	"ran_by" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"row_count_before" integer,
	"row_count_after" integer,
	"dry_run" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "load_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"load_id" integer NOT NULL,
	"author_user_id" integer,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "pcs_number" text;--> statement-breakpoint
ALTER TABLE "load_comments" ADD CONSTRAINT "load_comments_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_comments" ADD CONSTRAINT "load_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_data_integrity_runs_ran_at" ON "data_integrity_runs" USING btree ("ran_at");--> statement-breakpoint
CREATE INDEX "idx_data_integrity_runs_script_name" ON "data_integrity_runs" USING btree ("script_name");--> statement-breakpoint
CREATE INDEX "idx_load_comments_load_id" ON "load_comments" USING btree ("load_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assignments_pcs_number" ON "assignments" USING btree ("pcs_number");