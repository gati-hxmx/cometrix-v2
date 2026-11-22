import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatMessages, jobs } from "../src/db/schema";
import type { People } from "../src/lib/people";

// 常連と初見の API（#64）。
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("常連と初見の API（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let GET: typeof import("../src/app/api/jobs/[id]/people/route").GET;
  const get = (id: string) => GET(new Request("http://x/"), { params: Promise.resolve({ id }) });
  const people = async (id: string) => (await (await get(id)).json()) as People;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET } = await import("../src/app/api/jobs/[id]/people/route"));
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  let n = 0;
  async function seed(
    authors: string[],
    result: Record<string, unknown> | null,
    status: "done" | "failed" = "done",
  ) {
    const [job] = await db
      .insert(jobs)
      .values({ url: "u", videoId: `v${String(n++).padStart(10, "0")}`, status, result })
      .returning({ id: jobs.id });
    if (authors.length)
      await db
        .insert(chatMessages)
        .values(
          authors.map((author, i) => ({ jobId: job.id, offsetMs: i * 1000, author, body: "w" })),
        );
    return job.id;
  }

  const ch = (streamedAt: number, channelId = "youtube:UCa") => ({ channelId, streamedAt });

  test("コメントの多い順に上位を出し、同じ数なら名前順。人数は同じ人を1人と数える", async () => {
    const id = await seed(["b", "a", "a", "c", "c", "c", "b"], null);
    const p = await people(id);
    expect(p.top).toEqual([
      { author: "c", count: 3 },
      { author: "a", count: 2 },
      { author: "b", count: 2 },
    ]);
    expect(p.authors).toBe(3);
    expect(p.firstTimers).toBeNull();
  });

  test("上位は10人まで", async () => {
    const id = await seed(
      Array.from({ length: 15 }, (_, i) => `u${i}`),
      null,
    );
    expect((await people(id)).top).toHaveLength(10);
  });

  test("同じチャンネルの前の配信にいなかった人を初見と数える", async () => {
    await seed(["a", "b"], ch(100));
    await seed(["c"], ch(200));
    // 別のチャンネル・後の配信・失敗した分析は比べない
    await seed(["d"], ch(150, "youtube:UCother"));
    await seed(["e"], ch(400));
    await seed(["f"], ch(120), "failed");
    const id = await seed(["a", "c", "d", "e", "f", "g"], ch(300));
    const p = await people(id);
    expect(p.firstTimers).toEqual({ count: 4, pastJobs: 2 });
  });

  test("前の配信がない・チャンネルが分からないときは初見を出さない", async () => {
    const first = await seed(["a"], ch(100));
    expect((await people(first)).firstTimers).toBeNull();
    await seed(["a"], ch(50));
    const noChannel = await seed(["a"], { title: "x" });
    expect((await people(noChannel)).firstTimers).toBeNull();
  });

  test("分析が終わっていなければ 409、無ければ 404", async () => {
    const id = await seed([], null, "failed");
    expect((await get(id)).status).toBe(409);
    expect((await get("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await get("x")).status).toBe(404);
  });
});
