import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";

// コメントした人数の線（#55）。
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("人数の集計 API（Postgres）", () => {
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

  const rows = [
    { offsetMs: -1000, author: "early", body: "待機" },
    // 0〜30秒：taro の連投3回と jiro で2人（コメントは4件）
    { offsetMs: 1000, author: "taro", body: "草" },
    { offsetMs: 2000, author: "taro", body: "草" },
    { offsetMs: 20000, author: "taro", body: "wwww" },
    { offsetMs: 25000, author: "jiro", body: "こんにちは" },
    // 30〜60秒：0人。60〜90秒：3人
    { offsetMs: 61000, author: "taro", body: "w" },
    { offsetMs: 62000, author: "hana", body: "草" },
    { offsetMs: 63000, author: "jiro", body: "すごい" },
  ];

  test("同じ人の連投は1人として、区間ごとに人数を数える。開始前は除き、長さはそろえる", async () => {
    const id = await seedJob(rows, 90);
    expect(await counts(id, "users=1")).toEqual([2, 0, 3, 0]);
  });

  test("笑い・絞り込みと一緒に使うと、当てはまるコメントをした人を数える", async () => {
    const id = await seedJob(rows, 60);
    expect(await counts(id, "users=1&laugh=1")).toEqual([1, 0, 2]);
    expect(await counts(id, "users=1&user=jiro")).toEqual([1, 0, 1]);
  });

  test("スパム除外と一緒でも数えられる", async () => {
    const id = await seedJob(rows, 60);
    // taro の「草」の2回目は1秒後の同じ文で連投として除かれるが、taro は1人のまま。
    expect(await counts(id, "users=1&spam=1")).toEqual([2, 0, 3]);
  });

  test("users は 0・1 だけ。言葉の線（term）とは一緒に使えない", async () => {
    const id = await seedJob(rows, 60);
    expect((await get(id, "users=2")).status).toBe(400);
    expect((await get(id, `users=1&term=${encodeURIComponent("草")}`)).status).toBe(400);
    expect((await get(id, "users=0")).status).toBe(200);
  });
});
