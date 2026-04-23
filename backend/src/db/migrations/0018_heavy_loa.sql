CREATE TABLE "discrepancies" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_key" text NOT NULL,
	"assignment_id" integer,
	"load_id" integer,
	"discrepancy_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"v2_value" text,
	"pcs_value" text,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" integer,
	"resolution_notes" text
);
--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_discrepancies_open_per_subject_type" ON "discrepancies" USING btree ("subject_key","discrepancy_type") WHERE "discrepancies"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_discrepancies_assignment_open" ON "discrepancies" USING btree ("assignment_id") WHERE "discrepancies"."resolved_at" IS NULL AND "discrepancies"."assignment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_discrepancies_type_open" ON "discrepancies" USING btree ("discrepancy_type") WHERE "discrepancies"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_discrepancies_detected_at" ON "discrepancies" USING btree ("detected_at");