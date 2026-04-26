-- Sheet workflow status mirror — persists the team's painted state.
-- One row per (week, well-row, day-col) cell with a non-default color.
-- Mapping rule lives in the sync service: hex → workflow_status enum.

CREATE TABLE "sheet_well_status" (
  "id" serial PRIMARY KEY NOT NULL,
  "spreadsheet_id" text NOT NULL,
  "sheet_tab_name" text NOT NULL,
  "week_start" text NOT NULL,
  "row_index" integer NOT NULL,
  "well_name" text,
  "bill_to" text,
  "col_index" integer NOT NULL,
  "cell_value" text,
  "cell_hex" text,
  "status" text NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "idx_sheet_well_status_unique" ON "sheet_well_status"
  ("spreadsheet_id", "sheet_tab_name", "week_start", "row_index", "col_index");
--> statement-breakpoint

CREATE INDEX "idx_sheet_well_status_status" ON "sheet_well_status" ("status");
--> statement-breakpoint

CREATE INDEX "idx_sheet_well_status_week" ON "sheet_well_status" ("week_start");
