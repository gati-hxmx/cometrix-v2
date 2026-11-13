DROP INDEX "jobs_video_active_uniq";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "platform" text DEFAULT 'youtube' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_video_active_uniq" ON "jobs" USING btree ("platform","video_id") WHERE "jobs"."status" <> 'failed';