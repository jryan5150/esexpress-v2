CREATE TABLE "driver_roster" (
	"id" serial PRIMARY KEY NOT NULL,
	"tractor" text,
	"trailer" text,
	"driver_code" text,
	"driver_name" text,
	"company" text,
	"notes" text,
	"source_spreadsheet_id" text NOT NULL,
	"source_tab_name" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_row" jsonb
);
--> statement-breakpoint
CREATE TABLE "sand_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text,
	"location_code" text,
	"location_coords" text,
	"closest_city" text,
	"sand_type" text,
	"loading_facility" text,
	"lf_coords" text,
	"company" text,
	"rate" text,
	"mileage" text,
	"po_amount" text,
	"delivered" text,
	"remaining" text,
	"source_spreadsheet_id" text NOT NULL,
	"source_tab_name" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_row" jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_driver_roster_code" ON "driver_roster" USING btree ("driver_code");--> statement-breakpoint
CREATE INDEX "idx_driver_roster_name" ON "driver_roster" USING btree ("driver_name");--> statement-breakpoint
CREATE INDEX "idx_driver_roster_company" ON "driver_roster" USING btree ("company");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_driver_roster_source" ON "driver_roster" USING btree ("source_spreadsheet_id","source_tab_name","driver_code","driver_name");--> statement-breakpoint
CREATE INDEX "idx_sand_jobs_po" ON "sand_jobs" USING btree ("po_number");--> statement-breakpoint
CREATE INDEX "idx_sand_jobs_location_code" ON "sand_jobs" USING btree ("location_code");--> statement-breakpoint
CREATE INDEX "idx_sand_jobs_facility" ON "sand_jobs" USING btree ("loading_facility");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sand_jobs_source" ON "sand_jobs" USING btree ("source_spreadsheet_id","source_tab_name","po_number","location_code");