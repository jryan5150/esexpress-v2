CREATE TABLE "sheet_load_count_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"sheet_tab_name" text NOT NULL,
	"week_start" text NOT NULL,
	"week_end" text NOT NULL,
	"well_name" text,
	"bill_to" text,
	"sun_count" integer,
	"mon_count" integer,
	"tue_count" integer,
	"wed_count" integer,
	"thu_count" integer,
	"fri_count" integer,
	"sat_count" integer,
	"week_total" integer,
	"loads_left_over" integer,
	"loads_for_week" integer,
	"missed_load" integer,
	"total_to_build" integer,
	"total_built" integer,
	"discrepancy" integer,
	"status_color_hint" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_row" jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_sheet_snapshots_week" ON "sheet_load_count_snapshots" USING btree ("week_start","week_end");--> statement-breakpoint
CREATE INDEX "idx_sheet_snapshots_well" ON "sheet_load_count_snapshots" USING btree ("well_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sheet_snapshots_well_week_tab" ON "sheet_load_count_snapshots" USING btree ("spreadsheet_id","sheet_tab_name","week_start","well_name");