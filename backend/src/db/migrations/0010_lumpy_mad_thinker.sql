ALTER TABLE "jotform_imports" ADD COLUMN "original_ocr_bol_no" text;--> statement-breakpoint
ALTER TABLE "jotform_imports" ADD COLUMN "bol_corrected_by" integer;--> statement-breakpoint
ALTER TABLE "jotform_imports" ADD COLUMN "bol_corrected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jotform_imports" ADD CONSTRAINT "jotform_imports_bol_corrected_by_users_id_fk" FOREIGN KEY ("bol_corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;