ALTER TABLE "jobs" ADD COLUMN "last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "messages_purged_at" timestamp with time zone;