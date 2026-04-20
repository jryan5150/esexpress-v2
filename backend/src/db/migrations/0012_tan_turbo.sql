CREATE TABLE "match_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"load_id" integer NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"features_snapshot" jsonb NOT NULL,
	"score_before" numeric(4, 3) NOT NULL,
	"score_after" numeric(4, 3),
	"tier_before" text NOT NULL,
	"tier_after" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_decisions" ADD CONSTRAINT "match_decisions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_decisions" ADD CONSTRAINT "match_decisions_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_decisions" ADD CONSTRAINT "match_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_match_decisions_created_at" ON "match_decisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_match_decisions_action" ON "match_decisions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_match_decisions_assignment_id" ON "match_decisions" USING btree ("assignment_id");