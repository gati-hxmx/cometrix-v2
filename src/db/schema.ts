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
    // done のとき集計結果。running のあいだは取得の進み具合 { progress }（#43、src/lib/progress.ts）。
    result: jsonb("result"),
    // 失敗のとき { code, message }
    error: jsonb("error"),
    // 共有リンク（#68）の鍵。読むだけのページ /s/<鍵> で使う。分析の ID とは別にし、共有ページから元の分析画面へ辿れないようにする。
    shareToken: text("share_token"),
    // 共有しているあいだだけ入る（#68）。やめても鍵は残し、［元に戻す］で同じ鍵のまま再開する。
    // 鍵を外から受け取らないので、やめた鍵をほかの分析に付け替えられない。
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_status_created_idx").on(t.status, t.createdAt),
    uniqueIndex("jobs_video_active_uniq")
      .on(t.platform, t.videoId)
      .where(sql`${t.status} <> 'failed'`),
    uniqueIndex("jobs_share_token_uniq").on(t.shareToken),
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

// ログインした利用者（#7）。Google の利用者 ID（sub）で1人を決める。
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    picture: text("picture"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_google_sub_uniq").on(t.googleSub)],
);

// ログインの鍵（#7）。Cookie の値そのものは保存せず、SHA-256 のハッシュ（16進）を id にする。
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// 利用者と分析の紐づけ（#7）。分析は動画ごとに1つなので、同じ分析に何人も紐づく。
export const userJobs = pgTable(
  "user_jobs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.jobId] }),
    index("user_jobs_user_created_idx").on(t.userId, t.createdAt),
  ],
);
