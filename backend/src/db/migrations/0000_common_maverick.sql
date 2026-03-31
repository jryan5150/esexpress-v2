CREATE TABLE "assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"well_id" integer NOT NULL,
	"load_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to" integer,
	"assigned_by" integer,
	"auto_map_tier" integer,
	"auto_map_score" numeric(4, 3),
	"pcs_sequence" integer,
	"pcs_dispatch" jsonb DEFAULT '{}'::jsonb,
	"photo_status" text DEFAULT 'missing',
	"status_history" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"confirmed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "customer_mappings_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "driver_crossrefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"confirmed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "driver_crossrefs_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "invited_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'dispatcher' NOT NULL,
	"invited_by" integer,
	"accepted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "invited_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "loads" (
	"id" serial PRIMARY KEY NOT NULL,
	"load_no" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"driver_name" text,
	"driver_id" text,
	"truck_no" text,
	"trailer_no" text,
	"carrier_name" text,
	"customer_name" text,
	"product_description" text,
	"origin_name" text,
	"destination_name" text,
	"weight_tons" numeric(10, 4),
	"net_weight_tons" numeric(10, 4),
	"rate" numeric(10, 2),
	"mileage" numeric(10, 2),
	"bol_no" text,
	"order_no" text,
	"reference_no" text,
	"ticket_no" text,
	"status" text DEFAULT 'active',
	"delivered_on" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "location_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"well_id" integer,
	"confidence" numeric(4, 3) DEFAULT '0',
	"confirmed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "location_mappings_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "pcs_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_type" text NOT NULL,
	"token" text NOT NULL,
	"company_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"load_id" integer,
	"assignment_id" integer,
	"source" text NOT NULL,
	"source_url" text,
	"type" text,
	"ticket_no" text,
	"driver_name" text,
	"pcs_uploaded" boolean DEFAULT false,
	"pcs_attachment_type" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"confirmed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "product_mappings_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "sso_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_encrypted" text NOT NULL,
	"tenant_id" text,
	"enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"auth_provider" text DEFAULT 'local' NOT NULL,
	"sso_provider_id" text,
	"assigned_wells" jsonb DEFAULT '[]'::jsonb,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wells" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"daily_target_loads" integer,
	"daily_target_tons" numeric(10, 2),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"propx_job_id" text,
	"propx_destination_id" text,
	"match_feedback" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wells_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_well_id_wells_id_fk" FOREIGN KEY ("well_id") REFERENCES "public"."wells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invited_emails" ADD CONSTRAINT "invited_emails_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_mappings" ADD CONSTRAINT "location_mappings_well_id_wells_id_fk" FOREIGN KEY ("well_id") REFERENCES "public"."wells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assignments_well_load" ON "assignments" USING btree ("well_id","load_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_status" ON "assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_assignments_well" ON "assignments" USING btree ("well_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_assigned_to" ON "assignments" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_assignments_photo_status" ON "assignments" USING btree ("photo_status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_loads_source_sourceid" ON "loads" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "idx_loads_source" ON "loads" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_loads_destination" ON "loads" USING btree ("destination_name");--> statement-breakpoint
CREATE INDEX "idx_loads_driver" ON "loads" USING btree ("driver_name");--> statement-breakpoint
CREATE INDEX "idx_loads_ticket" ON "loads" USING btree ("ticket_no");--> statement-breakpoint
CREATE INDEX "idx_loads_bol" ON "loads" USING btree ("bol_no");--> statement-breakpoint
CREATE INDEX "idx_photos_load" ON "photos" USING btree ("load_id");--> statement-breakpoint
CREATE INDEX "idx_photos_assignment" ON "photos" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_wells_status" ON "wells" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wells_propx_job" ON "wells" USING btree ("propx_job_id");