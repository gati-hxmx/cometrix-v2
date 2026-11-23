ALTER TABLE "jobs" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_share_token_uniq" ON "jobs" USING btree ("share_token");