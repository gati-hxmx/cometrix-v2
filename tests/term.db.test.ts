import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { hasTerm, normalizeKeyword } from "../src/lib/term";
import { TERM_SAMPLES } from "./fixtures/term-samples";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("言葉の集計 API（Postgres）", () => {
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

  test("DB の判定は hasTerm と同じ（見本を1区間ずつに置いて数える）", async () => {
    const id = await seedJob(
      TERM_SAMPLES.map(([, body], i) => ({ offsetMs: i * 30000, author: "a", body })),
      (TERM_SAMPLES.length - 1) * 30,
    );
    for (const [i, [term, body]] of TERM_SAMPLES.entries()) {
      const got = await counts(id, `term=${encodeURIComponent(term)}`);
      const t = normalizeKeyword(term) as string;
      expect(got[i], `${term} / ${body}`).toBe(hasTerm(body, t) ? 1 : 0);
    }
  });

  test("区間ごとに数え、動画開始前は除き、長さは絞り込まない集計とそろえる", async () => {
    const id = await seedJob(
      [
        { offsetMs: -1000, author: "a", body: "草" },
        { offsetMs: 1000, author: "a", body: "草草草" },
        { offsetMs: 2000, author: "a", body: "大草原" },
        { offsetMs: 40000, author: "a", body: "こんにちは" },
      ],
      90,
    );
    expect(await counts(id, "term=%E8%8D%89")).toEqual([2, 0, 0, 0]);
  });

  test("term が不正なときは 400（空・2つ・101 文字・ほかの絞り込みと同時）", async () => {
    const id = await seedJob([{ offsetMs: 1000, author: "a", body: "草" }], 30);
    for (const qs of [
      "term=",
      "term=%20",
      "term=a&term=b",
      `term=${"a".repeat(101)}`,
      "term=a&q=b",
      "term=a&laugh=1",
      "term=a&user=b",
    ])
      expect((await get(id, qs)).status, qs).toBe(400);
  });

  test("分析が終わっていないときは 409", async () => {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId: "aaaaaaaaaaa", status: "running" })
      .returning({ id: jobs.id });
    expect((await get(job.id, "term=a")).status).toBe(409);
  });
});
