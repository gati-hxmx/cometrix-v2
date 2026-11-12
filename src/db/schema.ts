import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// チャット取得のジョブ。ワーカーが Postgres のこの表を見て順に処理する（Redis は使わない）。
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_status_created_idx").on(t.status, t.createdAt)],
);
