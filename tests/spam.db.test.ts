import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { dropSpam } from "../src/lib/spam";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("スパム除外・正規表現の API（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let BUCKETS: typeof import("../src/app/api/jobs/[id]/buckets/route").GET;
  let MESSAGES: typeof import("../src/app/api/jobs/[id]/messages/route").GET;
  const call =
    (h: () => typeof BUCKETS) =>
    (id: string, qs = "") =>
      h()(new Request(`http://x/?${qs}`), { params: Promise.resolve({ id }) });
  const buckets = call(() => BUCKETS);
  const messages = call(() => MESSAGES);
  const counts = async (id: string, qs: string) =>
    ((await (await buckets(id, qs)).json()) as { count: number }[]).map((r) => r.count);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET: BUCKETS } = await import("../src/app/api/jobs/[id]/buckets/route"));
    ({ GET: MESSAGES } = await import("../src/app/api/jobs/[id]/messages/route"));
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

  test("DB の判定は dropSpam と同じ（連投・境界・連鎖・長文・空白・大文字）", async () => {
    const rows = [
      { offsetMs: -500, author: "a", body: "before" },
      { offsetMs: 0, author: "a", body: "草" },
      { offsetMs: 10000, author: "a", body: " 草　" },
      { offsetMs: 25000, author: "a", body: "草" },
      { offsetMs: 55000, author: "a", body: "草" },
      { offsetMs: 85000, author: "a", body: "草" },
      { offsetMs: 85000, author: "b", body: "草" },
      { offsetMs: 90000, author: "c", body: "Hi" },
      { offsetMs: 91000, author: "c", body: "hi" },
      { offsetMs: 120000, author: "d", body: "あ".repeat(99) },
      { offsetMs: 121000, author: "d", body: "い".repeat(100) },
    ];
    const id = await seedJob(rows, 120);
    const expected = new Array(5).fill(0);
    for (const r of dropSpam(rows)) expected[Math.floor(r.offsetMs / 30000)]++;
    expect(await counts(id, "spam=1")).toEqual(expected);
  });

  test("絞り込み・笑いと同時に使え、判定は絞り込みの前の全コメントで行う", async () => {
    const id = await seedJob(
      [
        { offsetMs: 1000, author: "a", body: "草" },
        { offsetMs: 2000, author: "a", body: "草" },
        { offsetMs: 3000, author: "b", body: "草" },
        { offsetMs: 4000, author: "a", body: "ふつう" },
      ],
      0,
    );
    expect(await counts(id, "spam=1&laugh=1")).toEqual([2]);
    expect(await counts(id, "spam=1&user=a")).toEqual([2]);
    expect(await counts(id, "spam=0")).toEqual([0]);
  });

  test("spam が 0・1 以外は 400", async () => {
    const id = await seedJob([{ offsetMs: 0, author: "a", body: "x" }], 0);
    expect((await buckets(id, "spam=yes")).status).toBe(400);
    expect((await buckets(id, "spam=")).status).toBe(400);
  });

  test("正規表現：re・xre で絞り込め、一覧とグラフの両方に効く", async () => {
    const id = await seedJob(
      [
        { offsetMs: 1000, author: "a", body: "12345" },
        { offsetMs: 2000, author: "a", body: "!cmd" },
        { offsetMs: 3000, author: "a", body: "see HTTPS://x.y" },
        { offsetMs: 40000, author: "a", body: "hello" },
      ],
      30,
    );
    // 「+」が空白と読まれないよう、値を組み立ててエンコードする。
    const q = (s: string) =>
      s
        .split("&")
        .map((kv) => {
          const [k, ...v] = kv.split("=");
          return `${k}=${encodeURIComponent(v.join("="))}`;
        })
        .join("&");
    expect(await counts(id, q("re=^[0-9]+$"))).toEqual([1, 0]);
    expect(await counts(id, q("re=^!&re=https?://"))).toEqual([2, 0]);
    expect(await counts(id, q("xre=^[0-9]+$"))).toEqual([2, 1]);
    expect(await counts(id, q("re=^!&spam=1"))).toEqual([1, 0]);
    const list = (await (await messages(id, q("re=^[0-9]+$"))).json()) as { body: string }[];
    expect(list.map((r) => r.body)).toEqual(["12345"]);
  });

  test("DB だけが読めない正規表現は 500 ではなく 400（JS では読める）", async () => {
    const id = await seedJob([{ offsetMs: 0, author: "a", body: "x" }], 0);
    // JS では読めるが、Postgres（POSIX）では「先頭の量指定子」などで失敗する形
    const bad = encodeURIComponent("(?<n>x)");
    expect((await buckets(id, `re=${bad}`)).status).toBe(400);
    expect((await messages(id, `re=${bad}`)).status).toBe(400);
  });
});
