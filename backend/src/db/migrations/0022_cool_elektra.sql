CREATE TABLE "pcs_load_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"pcs_load_no" text NOT NULL,
	"pickup_date" timestamp with time zone,
	"customer" text,
	"origin" text,
	"destination_city" text,
	"pcs_status" text,
	"weight_lbs" integer,
	"miles" integer,
	"source_snapshot" text,
	"raw_data" jsonb,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pcs_load_history_loadno" ON "pcs_load_history" USING btree ("pcs_load_no");--> statement-breakpoint
CREATE INDEX "idx_pcs_load_history_pickup" ON "pcs_load_history" USING btree ("pickup_date");--> statement-breakpoint
CREATE INDEX "idx_pcs_load_history_customer" ON "pcs_load_history" USING btree ("customer");--> statement-breakpoint
CREATE INDEX "idx_pcs_load_history_dest_city" ON "pcs_load_history" USING btree ("destination_city");