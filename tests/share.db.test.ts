import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";

// 共有リンクの API と共有ページの中身（#68）。
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("共有リンク（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let route: typeof import("../src/app/api/jobs/[id]/share/route");
  let page: typeof import("../src/lib/share-page");
  let client: typeof import("../src/db/client");
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const post = (id: string) => route.POST(new Request("http://x/", { method: "POST" }), ctx(id));
  const del = (id: string) => route.DELETE(new Request("http://x/", { method: "DELETE" }), ctx(id));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrate(db, { migrationsFolder: "./drizzle" });
    route = await import("../src/app/api/jobs/[id]/share/route");
    page = await import("../src/lib/share-page");
    client = await import("../src/db/client");
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  let n = 0;
  async function seed(status: "done" | "running" = "done") {
    const videoId = `s${String(n++).padStart(10, "0")}`;
    const [job] = await db
      .insert(jobs)
      .values({
        url: "u",
        videoId,
        status,
        result: { title: "夜の配信", videoId, totalComments: 3, lastBucketSec: 30 },
      })
      .returning({ id: jobs.id });
    await db.insert(chatMessages).values([
      { jobId: job.id, offsetMs: 1000, author: "taro", body: "草" },
      { jobId: job.id, offsetMs: 31000, author: "jiro", body: "8888" },
    ]);
    await db.insert(chatBuckets).values([
      { jobId: job.id, startSec: 0, count: 1 },
      { jobId: job.id, startSec: 30, count: 2 },
    ]);
    return { id: job.id, videoId };
  }

  test("作ると鍵を返し、もう一度押しても同じ鍵", async () => {
    const { id } = await seed();
    const first = await post(id);
    expect(first.status).toBe(200);
    const { token } = (await first.json()) as { token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await (await post(id)).json()).toEqual({ token });
  });

  test("同時に2回押しても鍵は1つ", async () => {
    const { id } = await seed();
    const [a, b] = await Promise.all([post(id), post(id)]);
    const ta = ((await a.json()) as { token: string }).token;
    const tb = ((await b.json()) as { token: string }).token;
    expect(ta).toBe(tb);
  });

  test("分析が終わっていなければ 409、無ければ 404", async () => {
    const running = await seed("running");
    expect((await post(running.id)).status).toBe(409);
    expect((await post("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await post("x")).status).toBe(404);
    expect((await del("00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  test("共有ページの中身はタイトル・動画・グラフだけで、名前・本文・分析の ID は入らない", async () => {
    const { id, videoId } = await seed();
    const { token } = (await (await post(id)).json()) as { token: string };
    const shared = await page.loadShared(client.getDb(), token);
    expect(shared).toEqual({
      title: "夜の配信",
      platform: "youtube",
      videoId,
      totalComments: 3,
      buckets: [
        { startSec: 0, count: 1 },
        { startSec: 30, count: 2 },
      ],
    });
    const text = JSON.stringify(shared);
    for (const leak of ["taro", "jiro", "草", id]) expect(text).not.toContain(leak);
  });

  test("やめるとリンクは開けなくなり、再開すると同じ鍵で開ける", async () => {
    const { id } = await seed();
    const { token } = (await (await post(id)).json()) as { token: string };
    expect((await del(id)).status).toBe(204);
    expect(await page.loadShared(client.getDb(), token)).toBeNull();
    expect(await (await post(id)).json()).toEqual({ token });
    expect(await page.loadShared(client.getDb(), token)).not.toBeNull();
  });

  test("やめた鍵は、ほかの分析に付け替えられない（鍵は外から受け取らない）", async () => {
    const a = await seed();
    const b = await seed();
    const { token } = (await (await post(a.id)).json()) as { token: string };
    await del(a.id);
    // 本文に A の鍵を入れても無視され、B には別の鍵ができる
    const res = await route.POST(
      new Request("http://x/", { method: "POST", body: JSON.stringify({ token }) }),
      ctx(b.id),
    );
    const other = ((await res.json()) as { token: string }).token;
    expect(other).not.toBe(token);
    expect(await page.loadShared(client.getDb(), token)).toBeNull();
    expect(await (await post(a.id)).json()).toEqual({ token });
    expect((await page.loadShared(client.getDb(), token))?.videoId).toBe(a.videoId);
  });

  test("知らない鍵・形のちがう鍵は null", async () => {
    expect(await page.loadShared(client.getDb(), "a".repeat(22))).toBeNull();
    expect(await page.loadShared(client.getDb(), "../x")).toBeNull();
  });

  test("無い・やめたリンクの SNS の絵は 404", async () => {
    const { id } = await seed();
    const { token } = (await (await post(id)).json()) as { token: string };
    await del(id);
    const { default: Image } = await import("../src/app/s/[token]/opengraph-image");
    await expect(Image({ params: Promise.resolve({ token }) })).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    );
  });

  test("SNS の絵は、字が取れなくても PNG を返す", async () => {
    const { id } = await seed();
    const { token } = (await (await post(id)).json()) as { token: string };
    // Google Fonts だけ落ちている状態にする（next/og が自分の字を読む fetch はそのまま通す）
    const real = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) =>
        String(input instanceof Request ? input.url : input).includes("fonts.g")
          ? Promise.reject(new Error("offline"))
          : real(input, init),
      );
    try {
      const { default: Image } = await import("../src/app/s/[token]/opengraph-image");
      const res = await Image({ params: Promise.resolve({ token }) });
      expect(res.headers.get("content-type")).toBe("image/png");
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(buf.slice(1, 4), (c) => String.fromCharCode(c)).join("")).toBe("PNG");
    } finally {
      spy.mockRestore();
    }
  });
});
