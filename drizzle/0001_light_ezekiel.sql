CREATE TABLE "chat_buckets" (
	"job_id" uuid NOT NULL,
	"start_sec" integer NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "chat_buckets_job_id_start_sec_pk" PRIMARY KEY("job_id","start_sec")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" uuid NOT NULL,
	"offset_ms" integer NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "error" SET DATA TYPE jsonb USING to_jsonb("error");--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "video_id" text;--> statement-breakpoint
ALTER TABLE "chat_buckets" ADD CONSTRAINT "chat_buckets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_job_offset_idx" ON "chat_messages" USING btree ("job_id","offset_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_video_active_uniq" ON "jobs" USING btree ("video_id") WHERE "jobs"."status" <> 'failed';