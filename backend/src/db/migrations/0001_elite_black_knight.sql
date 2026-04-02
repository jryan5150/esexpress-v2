CREATE TABLE "bol_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text,
	"driver_name" text,
	"load_number" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"ai_extracted_data" jsonb,
	"ai_confidence" integer,
	"ai_metadata" jsonb,
	"driver_confirmed_at" timestamp with time zone,
	"driver_corrections" jsonb,
	"matched_load_id" integer,
	"match_method" text,
	"match_score" integer,
	"discrepancies" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending',
	"retry_count" integer DEFAULT 0,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ingestion_conflicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"propx_load_id" integer,
	"logistiq_load_id" integer,
	"match_key" text,
	"import_batch_id" text,
	"import_filename" text,
	"discrepancies" jsonb,
	"max_severity" text,
	"status" text DEFAULT 'pending',
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jotform_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"jotform_submission_id" text NOT NULL,
	"driver_name" text,
	"truck_no" text,
	"bol_no" text,
	"weight" numeric(12, 2),
	"photo_url" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"submitted_at" timestamp with time zone,
	"matched_load_id" integer,
	"match_method" text,
	"matched_at" timestamp with time zone,
	"status" text DEFAULT 'pending',
	"discrepancies" jsonb DEFAULT '[]'::jsonb,
	"import_batch_id" text,
	"manually_matched" boolean DEFAULT false,
	"manually_matched_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "jotform_imports_jotform_submission_id_unique" UNIQUE("jotform_submission_id")
);
--> statement-breakpoint
CREATE TABLE "payment_batch_loads" (
	"batch_id" integer NOT NULL,
	"load_id" integer NOT NULL,
	CONSTRAINT "payment_batch_loads_batch_id_load_id_pk" PRIMARY KEY("batch_id","load_id")
);
--> statement-breakpoint
CREATE TABLE "payment_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_number" text NOT NULL,
	"driver_id" text NOT NULL,
	"driver_name" text NOT NULL,
	"carrier_name" text,
	"week_start" timestamp with time zone NOT NULL,
	"week_end" timestamp with time zone NOT NULL,
	"load_count" integer DEFAULT 0,
	"total_weight_tons" numeric(12, 4),
	"total_mileage" numeric(12, 2),
	"rate_per_ton" numeric(10, 2),
	"rate_per_mile" numeric(10, 2),
	"rate_type" text DEFAULT 'per_ton',
	"gross_pay" numeric(12, 2),
	"total_deductions" numeric(12, 2) DEFAULT '0',
	"net_pay" numeric(12, 2),
	"deductions" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft',
	"status_history" jsonb DEFAULT '[]'::jsonb,
	"sheets_export_url" text,
	"sheets_exported_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payment_batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
CREATE TABLE "propx_drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"propx_driver_id" text NOT NULL,
	"driver_name" text,
	"carrier_id" text,
	"carrier_name" text,
	"truck_no" text,
	"trailer_no" text,
	"status" text,
	"raw_data" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "propx_drivers_propx_driver_id_unique" UNIQUE("propx_driver_id")
);
--> statement-breakpoint
CREATE TABLE "propx_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"propx_job_id" text NOT NULL,
	"job_name" text,
	"customer_id" text,
	"customer_name" text,
	"status" text,
	"working_status" text,
	"has_pending_loads" boolean DEFAULT true,
	"load_count" integer DEFAULT 0,
	"raw_data" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "propx_jobs_propx_job_id_unique" UNIQUE("propx_job_id")
);
--> statement-breakpoint
ALTER TABLE "bol_submissions" ADD CONSTRAINT "bol_submissions_matched_load_id_loads_id_fk" FOREIGN KEY ("matched_load_id") REFERENCES "public"."loads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_conflicts" ADD CONSTRAINT "ingestion_conflicts_propx_load_id_loads_id_fk" FOREIGN KEY ("propx_load_id") REFERENCES "public"."loads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_conflicts" ADD CONSTRAINT "ingestion_conflicts_logistiq_load_id_loads_id_fk" FOREIGN KEY ("logistiq_load_id") REFERENCES "public"."loads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_conflicts" ADD CONSTRAINT "ingestion_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jotform_imports" ADD CONSTRAINT "jotform_imports_matched_load_id_loads_id_fk" FOREIGN KEY ("matched_load_id") REFERENCES "public"."loads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jotform_imports" ADD CONSTRAINT "jotform_imports_manually_matched_by_users_id_fk" FOREIGN KEY ("manually_matched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batch_loads" ADD CONSTRAINT "payment_batch_loads_batch_id_payment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batch_loads" ADD CONSTRAINT "payment_batch_loads_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bol_status" ON "bol_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bol_matched_load" ON "bol_submissions" USING btree ("matched_load_id");--> statement-breakpoint
CREATE INDEX "idx_bol_driver" ON "bol_submissions" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_conflicts_status" ON "ingestion_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conflicts_match_key" ON "ingestion_conflicts" USING btree ("match_key");--> statement-breakpoint
CREATE INDEX "idx_jotform_status" ON "jotform_imports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jotform_matched_load" ON "jotform_imports" USING btree ("matched_load_id");--> statement-breakpoint
CREATE INDEX "idx_jotform_bol" ON "jotform_imports" USING btree ("bol_no");--> statement-breakpoint
CREATE INDEX "idx_pbl_load" ON "payment_batch_loads" USING btree ("load_id");--> statement-breakpoint
CREATE INDEX "idx_payment_status" ON "payment_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_driver" ON "payment_batches" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_payment_driver_week" ON "payment_batches" USING btree ("driver_id","week_start","week_end");--> statement-breakpoint
CREATE INDEX "idx_assignments_load" ON "assignments" USING btree ("load_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_status_well" ON "assignments" USING btree ("status","well_id");--> statement-breakpoint
CREATE INDEX "idx_loads_load_no" ON "loads" USING btree ("load_no");--> statement-breakpoint
CREATE INDEX "idx_loads_delivered_on" ON "loads" USING btree ("delivered_on");--> statement-breakpoint
CREATE INDEX "idx_loads_driver_id" ON "loads" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_loads_status_delivered" ON "loads" USING btree ("status","delivered_on");--> statement-breakpoint
CREATE INDEX "idx_wells_name_trgm" ON "wells" USING gin ("name" gin_trgm_ops);