ALTER TABLE "loads" ADD COLUMN "historical_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "historical_complete_reason" text;--> statement-breakpoint
CREATE INDEX "idx_loads_historical_complete" ON "loads" USING btree ("historical_complete");