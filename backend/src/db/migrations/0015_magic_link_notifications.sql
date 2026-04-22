CREATE TABLE "magic_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_from_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_magic_link_tokens_token" ON "magic_link_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_magic_link_tokens_email" ON "magic_link_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_magic_link_tokens_expires_at" ON "magic_link_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_notification_events_event_type" ON "notification_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_notification_events_recipient" ON "notification_events" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "idx_notification_events_sent_at" ON "notification_events" USING btree ("sent_at");