import { sql as dsql, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { purgeStale } from "../src/lib/purge";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("古い分析の掃除（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let jobApi: typeof import("../src/app/api/jobs/[id]/route").GET;
  let messagesApi: typeof import("../src/app/api/jobs/[id]/messages/route").GET;
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET: jobApi } = await import("../src/app/api/jobs/[id]/route"));
    ({ GET: messagesApi } = await import("../src/app/api/jobs/[id]/messages/route"));
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  let n = 0;
  async function seed(opts: {
    status?: "done" | "running" | "queued" | "failed";
    createdDaysAgo: number;
    openedDaysAgo?: number;
  }) {
    n += 1;
    const [job] = await db
      .insert(jobs)
      .values({
        url: "u",
        videoId: `v${String(n).padStart(10, "0")}`,
        status: opts.status ?? "done",
        createdAt: dsql`now() - make_interval(days => ${opts.createdDaysAgo})` as never,
        lastOpenedAt:
          opts.openedDaysAgo === undefined
            ? null
            : (dsql`now() - make_interval(days => ${opts.openedDaysAgo})` as never),
      })
      .returning({ id: jobs.id });
    await db.insert(chatMessages).values([
      { jobId: job.id, offsetMs: 1000, author: "a", body: "x" },
      { jobId: job.id, offsetMs: 2000, author: "b", body: "y" },
    ]);
    await db.insert(chatBuckets).values({ jobId: job.id, startSec: 0, count: 2 });
    return job.id;
  }
  const msgCount = async (id: string) =>
    (await db.select().from(chatMessages).where(eq(chatMessages.jobId, id))).length;
  const bucketCount = async (id: string) =>
    (await db.select().from(chatBuckets).where(eq(chatBuckets.jobId, id))).length;

  test("90日を超えて開かれていない done の本文だけ消し、集計とジョブは残す", async () => {
    const old = await seed({ createdDaysAgo: 100 });
    expect(await purgeStale(db, { days: 90 })).toBe(1);
    expect(await msgCount(old)).toBe(0);
    expect(await bucketCount(old)).toBe(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, old));
    expect(row.messagesPurgedAt).not.toBeNull();
    expect(row.status).toBe("done");
  });

  test("最近開かれた分析は、作成が古くても消さない", async () => {
    const id = await seed({ createdDaysAgo: 200, openedDaysAgo: 5 });
    expect(await purgeStale(db, { days: 90 })).toBe(0);
    expect(await msgCount(id)).toBe(2);
  });

  test("境界：ちょうど days 日前は消さず、超えたら消す", async () => {
    const edge = await seed({ createdDaysAgo: 90 });
    // 作成のあと数ミリ秒たつので「ちょうど」は実質 90日+少し。89日は確実に残る。
    const young = await seed({ createdDaysAgo: 89 });
    const over = await seed({ createdDaysAgo: 91 });
    await purgeStale(db, { days: 90 });
    expect(await msgCount(young)).toBe(2);
    expect(await msgCount(over)).toBe(0);
    expect([0, 2]).toContain(await msgCount(edge));
  });

  test("done 以外には触らない", async () => {
    const ids = [
      await seed({ status: "running", createdDaysAgo: 500 }),
      await seed({ status: "queued", createdDaysAgo: 500 }),
      await seed({ status: "failed", createdDaysAgo: 500 }),
    ];
    expect(await purgeStale(db, { days: 90 })).toBe(0);
    for (const id of ids) expect(await msgCount(id)).toBe(2);
  });

  test("掃除済みは再び数えない", async () => {
    await seed({ createdDaysAgo: 100 });
    expect(await purgeStale(db, { days: 90 })).toBe(1);
    expect(await purgeStale(db, { days: 90 })).toBe(0);
  });

  test("days が不正なら何も消さずに失敗する", async () => {
    const id = await seed({ createdDaysAgo: 500 });
    for (const d of [0, -1, 1.5, Number.NaN]) {
      await expect(purgeStale(db, { days: d })).rejects.toThrow();
    }
    expect(await msgCount(id)).toBe(2);
  });

  test("API：開くと last_opened_at が付き、1時間以内は書き換えない", async () => {
    const id = await seed({ createdDaysAgo: 1 });
    const res = await jobApi(new Request("http://x/"), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).messagesPurged).toBe(false);
    const [a] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(a.lastOpenedAt).not.toBeNull();
    await jobApi(new Request("http://x/"), ctx(id));
    const [b] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(b.lastOpenedAt?.getTime()).toBe(a.lastOpenedAt?.getTime());
  });

  test("API：1時間以上前なら更新し、done 以外は更新しない", async () => {
    const old = await seed({ createdDaysAgo: 5, openedDaysAgo: 3 });
    const running = await seed({ status: "running", createdDaysAgo: 5 });
    await jobApi(new Request("http://x/"), ctx(old));
    await jobApi(new Request("http://x/"), ctx(running));
    const [o] = await db.select().from(jobs).where(eq(jobs.id, old));
    const [r] = await db.select().from(jobs).where(eq(jobs.id, running));
    expect(Date.now() - (o.lastOpenedAt?.getTime() ?? 0)).toBeLessThan(60_000);
    expect(r.lastOpenedAt).toBeNull();
  });

  test("API：掃除済みは messagesPurged が真で、/messages は 200 の空配列", async () => {
    const id = await seed({ createdDaysAgo: 100 });
    await purgeStale(db, { days: 90 });
    const job = await (await jobApi(new Request("http://x/"), ctx(id))).json();
    expect(job.messagesPurged).toBe(true);
    const res = await messagesApi(new Request("http://x/?aroundSec=0"), ctx(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("API：存在しない ID は 404 で何も書かない", async () => {
    const res = await jobApi(new Request("http://x/"), ctx("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(404);
  });
});
