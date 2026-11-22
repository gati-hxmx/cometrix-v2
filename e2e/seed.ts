import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";

export const DB_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

/** テスト用の DB に接続する（外部の取得ワーカーは動かさず、仮データを直接入れる）。 */
export function openDb() {
  if (!DB_URL) throw new Error("E2E_DATABASE_URL か DATABASE_URL を設定してください");
  const sql = postgres(DB_URL, { max: 2 });
  return { sql, db: drizzle(sql, { schema }) };
}

export async function migrateDb() {
  const { sql, db } = openDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
  await sql.end();
}

export const VIDEO_ID = "aaaaaaaaaaa";
export const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
export const FIXTURE_TITLE = "テスト配信（仮データ）";

/** 送信で作られたジョブを done にし、仮のコメントと30秒ごとの集計を入れる。区間は 0〜570 秒の20個。 */
export async function completeJob(jobId: string) {
  const { sql, db } = openDb();
  const rows = [] as { jobId: string; offsetMs: number; author: string; body: string }[];
  const counts: number[] = [];
  for (let b = 0; b < 20; b++) {
    const n = b === 4 ? 12 : (b % 3) + 1; // 120〜150秒の区間を山にする
    counts.push(n);
    for (let i = 0; i < n; i++) {
      rows.push({
        jobId,
        offsetMs: b * 30_000 + i * 1000,
        author: `視聴者${i % 4}`,
        body: b === 4 ? (i % 2 ? "草" : `山のコメント${i}`) : `コメント${b}-${i}`,
      });
    }
  }
  await db.insert(chatMessages).values(rows);
  await db
    .insert(chatBuckets)
    .values(counts.map((count, b) => ({ jobId, startSec: b * 30, count })));
  await db
    .update(jobs)
    .set({
      status: "done",
      result: { videoId: VIDEO_ID, title: FIXTURE_TITLE, totalComments: rows.length },
    })
    .where(eq(jobs.id, jobId));
  await sql.end();
}

export async function clearJobs() {
  const { sql, db } = openDb();
  await db.delete(jobs);
  await sql.end();
}
