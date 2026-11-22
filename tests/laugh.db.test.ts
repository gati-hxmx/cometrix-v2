import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { isLaugh } from "../src/lib/laugh";
import { LAUGHS, NOT_LAUGHS } from "./fixtures/laugh-samples";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("笑いの集計 API（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let GET: typeof import("../src/app/api/jobs/[id]/buckets/route").GET;
  const get = (id: string, qs = "") =>
    GET(new Request(`http://x/?${qs}`), { params: Promise.resolve({ id }) });
  const counts = async (id: string, qs: string) =>
    ((await (await get(id, qs)).json()) as { count: number }[]).map((r) => r.count);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET } = await import("../src/app/api/jobs/[id]/buckets/route"));
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  async function seedJob(rows: { offsetMs: number; author: string; body: string }[], last: number) {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId: "aaaaaaaaaaa", status: "done" })
      .returning({ id: jobs.id });
    await db.insert(chatMessages).values(rows.map((r) => ({ ...r, jobId: job.id })));
    const b = [];
    for (let s = 0; s <= last; s += 30) b.push({ jobId: job.id, startSec: s, count: 0 });
    await db.insert(chatBuckets).values(b);
    return job.id;
  }

  test("DB の判定は isLaugh と同じ（見本をすべて1区間ずつに置いて数える）", async () => {
    const all = [...LAUGHS, ...NOT_LAUGHS];
    const id = await seedJob(
      all.map((body, i) => ({ offsetMs: i * 30000, author: "a", body })),
      (all.length - 1) * 30,
    );
    expect(await counts(id, "laugh=1")).toEqual(all.map((t) => (isLaugh(t) ? 1 : 0)));
  });

  test("同じ区間の笑いを数え、動画開始前は除き、長さは絞り込まない集計とそろえる", async () => {
    const id = await seedJob(
      [
        { offsetMs: -1000, author: "a", body: "草" },
        { offsetMs: 1000, author: "taro", body: "草" },
        { offsetMs: 2000, author: "jiro", body: "wwww" },
        { offsetMs: 3000, author: "taro", body: "こんにちは" },
        { offsetMs: 40000, author: "taro", body: "それなw" },
      ],
      90,
    );
    expect(await counts(id, "laugh=1")).toEqual([2, 1, 0, 0]);
    expect(await counts(id, "laugh=0")).toEqual([0, 0, 0, 0]);
  });

  test("キーワード・ユーザーの絞り込みと同時に使える", async () => {
    const id = await seedJob(
      [
        { offsetMs: 1000, author: "taro", body: "草" },
        { offsetMs: 2000, author: "jiro", body: "大草原 www" },
        { offsetMs: 3000, author: "taro", body: "草じゃない話" },
        { offsetMs: 40000, author: "taro", body: "www" },
      ],
      30,
    );
    expect(await counts(id, "laugh=1&user=taro")).toEqual([2, 1]);
    expect(await counts(id, "laugh=1&q=www")).toEqual([1, 1]);
    expect(await counts(id, "laugh=1&xuser=taro")).toEqual([1, 0]);
  });

  test("laugh が 0・1 以外は 400", async () => {
    const id = await seedJob([{ offsetMs: 0, author: "a", body: "草" }], 0);
    expect((await get(id, "laugh=yes")).status).toBe(400);
    expect((await get(id, "laugh=")).status).toBe(400);
  });
});
