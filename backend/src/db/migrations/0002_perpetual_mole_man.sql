CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"page_url" text,
	"route_name" text,
	"screenshot_url" text,
	"breadcrumbs" jsonb DEFAULT '[]'::jsonb,
	"session_summary" jsonb,
	"browser" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"records_processed" integer DEFAULT 0,
	"duration_ms" integer,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feedback_category" ON "feedback" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_feedback_created" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_runs_source" ON "sync_runs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_sync_runs_started" ON "sync_runs" USING btree ("started_at");