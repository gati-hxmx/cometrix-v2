import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatMessages, jobs } from "../src/db/schema";

// チャットの CSV 書き出し（#59）。
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("GET /api/jobs/:id/export（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let GET: typeof import("../src/app/api/jobs/[id]/export/route").GET;
  const get = (id: string, qs = "") =>
    GET(new Request(`http://x/?${qs}`), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    ({ GET } = await import("../src/app/api/jobs/[id]/export/route"));
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  async function seed(n: number, status: "done" | "running" = "done") {
    const [job] = await db
      .insert(jobs)
      .values({
        url: "u",
        videoId: "aaaaaaaaaaa",
        status,
        result: { title: "配信/テスト" },
      })
      .returning({ id: jobs.id });
    const rows = [{ jobId: job.id, offsetMs: -500, author: "early", body: "開始前" }];
    for (let i = 0; i < n; i++)
      rows.push({
        jobId: job.id,
        offsetMs: (n - i) * 1000,
        author: i % 2 ? "taro" : "jiro",
        body: i === 0 ? '=1+1,"引用"' : `msg${i}`,
      });
    for (let i = 0; i < rows.length; i += 5000)
      await db.insert(chatMessages).values(rows.slice(i, i + 5000));
    return job.id;
  }

  test("時刻順の CSV を全件返し、開始前は除く。BOM・見出し・ファイル名つき", async () => {
    const id = await seed(12_001);
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      `filename*=UTF-8''${encodeURIComponent("配信_テスト.csv")}`,
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Excel が UTF-8 として読むよう、先頭に BOM（EF BB BF）
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    const lines = text.split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("時刻,秒,投稿者,コメント");
    expect(lines).toHaveLength(12_002);
    expect(lines[1]).toBe("0:01,1,jiro,msg12000");
    expect(text).not.toContain("開始前");
    expect(lines[12_001]).toBe(`3:20:01,12001,jiro,"'=1+1,""引用"""`);
  });

  test("絞り込みはチャット一覧と同じ", async () => {
    const id = await seed(10);
    const lines = (await (await get(id, "user=taro")).text()).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(6);
    expect(lines.slice(1).every((l) => l.includes(",taro,"))).toBe(true);
  });

  test("終わっていない分析は 409、壊れた正規表現は 400", async () => {
    const running = await seed(1, "running");
    expect((await get(running)).status).toBe(409);
    await db.delete(jobs);
    const id = await seed(1);
    expect((await get(id, `re=${encodeURIComponent("(")}`)).status).toBe(400);
  });
});
