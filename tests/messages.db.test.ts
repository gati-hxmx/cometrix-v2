import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("チャットの絞り込み API（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let messages: typeof import("../src/app/api/jobs/[id]/messages/route").GET;
  let buckets: typeof import("../src/app/api/jobs/[id]/buckets/route").GET;
  const get = (fn: typeof messages, id: string, qs = "") =>
    fn(new Request(`http://x/?${qs}`), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET: messages } = await import("../src/app/api/jobs/[id]/messages/route"));
    ({ GET: buckets } = await import("../src/app/api/jobs/[id]/buckets/route"));
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  async function seed(status: "done" | "running" = "done", videoId = "aaaaaaaaaaa") {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId, status })
      .returning({ id: jobs.id });
    await db.insert(chatMessages).values([
      { jobId: job.id, offsetMs: 1000, author: "Taro", body: "Hello" },
      { jobId: job.id, offsetMs: 20000, author: "Hanako", body: "100% 草" },
      { jobId: job.id, offsetMs: 40000, author: "taro_2", body: "hello again" },
      { jobId: job.id, offsetMs: 100000, author: "Jiro", body: "end" },
      { jobId: job.id, offsetMs: -5000, author: "Early", body: "hello before" },
    ]);
    await db.insert(chatBuckets).values([
      { jobId: job.id, startSec: 0, count: 2 },
      { jobId: job.id, startSec: 30, count: 1 },
      { jobId: job.id, startSec: 60, count: 0 },
      { jobId: job.id, startSec: 90, count: 1 },
    ]);
    return job.id;
  }

  test("絞り込みなしは時刻順で、動画開始前は除く", async () => {
    const id = await seed();
    const rows = (await (await get(messages, id)).json()) as { offsetMs: number }[];
    expect(rows.map((r) => r.offsetMs)).toEqual([1000, 20000, 40000, 100000]);
  });

  test("aroundSec に近い limit 件を時刻順で返す", async () => {
    const id = await seed();
    const rows = (await (await get(messages, id, "aroundSec=40&limit=2")).json()) as {
      offsetMs: number;
    }[];
    expect(rows.map((r) => r.offsetMs)).toEqual([20000, 40000]);
  });

  test("キーワードは本文、ユーザー名は名前の部分一致（大文字小文字を無視）、両方は AND", async () => {
    const id = await seed();
    const body = async (qs: string) =>
      ((await (await get(messages, id, qs)).json()) as { author: string }[]).map((r) => r.author);
    expect(await body("q=HELLO")).toEqual(["Taro", "taro_2"]);
    expect(await body("user=taro")).toEqual(["Taro", "taro_2"]);
    expect(await body("q=again&user=taro")).toEqual(["taro_2"]);
    expect(await body("q=hello&user=jiro")).toEqual([]);
  });

  test("% と _ は文字として扱う", async () => {
    const id = await seed();
    const authors = async (qs: string) =>
      ((await (await get(messages, id, qs)).json()) as { author: string }[]).map((r) => r.author);
    expect(await authors("q=100%25")).toEqual(["Hanako"]);
    expect(await authors("q=_")).toEqual([]);
    expect(await authors("user=_")).toEqual(["taro_2"]);
  });

  test("不正な値は 400、done 以外は 409、ID が違うと 404", async () => {
    const id = await seed();
    for (const qs of ["limit=0", "limit=201", "limit=a", "aroundSec=-1", `q=${"a".repeat(101)}`])
      expect((await get(messages, id, qs)).status).toBe(400);
    expect((await get(messages, await seed("running", "bbbbbbbbbbb"))).status).toBe(409);
    expect((await get(messages, "bad")).status).toBe(404);
    expect((await get(messages, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  test("buckets は絞り込むと一致数を同じ区間・同じ長さで返す", async () => {
    const id = await seed();
    const res = await get(buckets, id, "q=hello");
    expect(await res.json()).toEqual([
      { startSec: 0, count: 1 },
      { startSec: 30, count: 1 },
      { startSec: 60, count: 0 },
      { startSec: 90, count: 0 },
    ]);
  });

  test("buckets は一致が0件でも全区間が0で返り、不正な語は 400", async () => {
    const id = await seed();
    const rows = (await (await get(buckets, id, "q=zzz")).json()) as { count: number }[];
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect((await get(buckets, id, `user=${"a".repeat(101)}`)).status).toBe(400);
  });
});
