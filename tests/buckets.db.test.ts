import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, jobs } from "../src/db/schema";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("GET /api/jobs/:id/buckets（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let GET: typeof import("../src/app/api/jobs/[id]/buckets/route").GET;
  const call = (id: string) => GET(new Request("http://x"), { params: Promise.resolve({ id }) });

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

  test("done のジョブは開始秒の昇順で返す", async () => {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId: "aaaaaaaaaaa", status: "done" })
      .returning({ id: jobs.id });
    await db.insert(chatBuckets).values([
      { jobId: job.id, startSec: 30, count: 2 },
      { jobId: job.id, startSec: 0, count: 5 },
    ]);
    const res = await call(job.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { startSec: 0, count: 5 },
      { startSec: 30, count: 2 },
    ]);
  });

  test("done 以外は 409、存在しない・形が違う ID は 404", async () => {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId: "bbbbbbbbbbb", status: "running" })
      .returning({ id: jobs.id });
    expect((await call(job.id)).status).toBe(409);
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await call("abc")).status).toBe(404);
  });
});

describe.skipIf(!url)("GET /api/jobs/:id（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let GET: typeof import("../src/app/api/jobs/[id]/route").GET;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET } = await import("../src/app/api/jobs/[id]/route"));
  });
  afterAll(async () => {
    await sql.end();
  });

  test("チャットがなく失敗したジョブでも、動画を出せるよう videoId を返す", async () => {
    await db.delete(jobs);
    const [job] = await db
      .insert(jobs)
      .values({
        url: "u",
        videoId: "ccccccccccc",
        status: "failed",
        error: { code: "no_chat", message: "m" },
      })
      .returning({ id: jobs.id });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "failed",
      videoId: "ccccccccccc",
      error: { code: "no_chat" },
    });
  });
});
