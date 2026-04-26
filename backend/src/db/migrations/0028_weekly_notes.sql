-- Per-week human notes captured from the bottom of each weekly tab on
-- the Load Count Sheet. See docs/2026-04-25-load-count-sheet-analysis.md
-- §5 for the convention they've used since 2022.

CREATE TABLE "weekly_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "spreadsheet_id" text NOT NULL,
  "sheet_tab_name" text NOT NULL,
  "week_start" text NOT NULL,
  "body" text NOT NULL,
  "row_index" integer,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "idx_weekly_notes_unique" ON "weekly_notes"
  ("spreadsheet_id", "sheet_tab_name", "week_start");
--> statement-breakpoint

CREATE INDEX "idx_weekly_notes_week" ON "weekly_notes" ("week_start");
