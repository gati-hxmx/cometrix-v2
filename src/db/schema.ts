import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// チャット取得のジョブ。ワーカーが Postgres のこの表を見て順に処理する（Redis は使わない）。
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    // 正規化した動画 ID。同じ動画の重複登録を防ぐ（failed 以外は1動画1件）。
    videoId: text("video_id"),
    // 動画の置き場。動画 ID の重複はプラットフォームごとに見る。
    platform: text("platform", { enum: ["youtube", "twitch"] })
      .notNull()
      .default("youtube"),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result"),
    // 失敗のとき { code, message }
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_status_created_idx").on(t.status, t.createdAt),
    uniqueIndex("jobs_video_active_uniq")
      .on(t.platform, t.videoId)
      .where(sql`${t.status} <> 'failed'`),
  ],
);

// 各コメント。時刻は動画の先頭からのミリ秒。
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    offsetMs: integer("offset_ms").notNull(),
    author: text("author").notNull(),
    body: text("body").notNull(),
  },
  (t) => [index("chat_messages_job_offset_idx").on(t.jobId, t.offsetMs)],
);

// 30秒ごとのコメント数。start_sec は区間の開始秒。
export const chatBuckets = pgTable(
  "chat_buckets",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    startSec: integer("start_sec").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.startSec] })],
);
