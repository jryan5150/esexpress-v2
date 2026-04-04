CREATE TABLE "breadcrumbs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"event_type" text NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb,
	"zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "breadcrumbs" ADD CONSTRAINT "breadcrumbs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_breadcrumbs_event_type" ON "breadcrumbs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_breadcrumbs_created_at" ON "breadcrumbs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_breadcrumbs_user_id" ON "breadcrumbs" USING btree ("user_id");