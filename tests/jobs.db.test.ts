import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { enqueue } from "../src/lib/jobs";
import { parseLiveChat } from "../src/worker/chat-parse";
import { JobFailure } from "../src/worker/errors";
import { claimJob, processNext, reapStale, runJob } from "../src/worker/process";

// Postgres が要るテスト。TEST_DATABASE_URL があるときだけ動かす（scripts/check の CI では compose の db を使う）。
const url = process.env.TEST_DATABASE_URL;
const sample = readFileSync(new URL("./fixtures/live_chat.sample.jsonl", import.meta.url), "utf8");
const A = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
const B = "https://www.youtube.com/watch?v=bbbbbbbbbbb";

describe.skipIf(!url)("ジョブ処理（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 5 });
  const db = drizzle(sql, { schema });
  const ok = async () => ({ title: "テスト配信", messages: parseLiveChat(sample) });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  test("登録するとジョブができ、ワーカーが処理して集計とコメントが入る", async () => {
    const res = await enqueue(db, `${A}&t=5`);
    if (!res.ok) throw new Error("enqueue failed");
    expect(await processNext(db, ok)).toBe(true);

    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("done");
    expect(job.result).toEqual({
      platform: "youtube",
      videoId: "aaaaaaaaaaa",
      title: "テスト配信",
      totalComments: 4,
      lastBucketSec: 90,
    });
    const buckets = await db
      .select()
      .from(chatBuckets)
      .where(eq(chatBuckets.jobId, res.id))
      .orderBy(chatBuckets.startSec);
    expect(buckets.map((b) => b.count)).toEqual([2, 1, 0, 1]);
    const msgs = await db.select().from(chatMessages).where(eq(chatMessages.jobId, res.id));
    expect(msgs).toHaveLength(4);
    expect(msgs.find((m) => m.author === "alice")?.body).toBe("こんにちは:smile:");
    expect(await processNext(db, ok)).toBe(false);
  });

  test("同じ動画は既存のジョブを返し、failed なら新しく作る", async () => {
    const first = await enqueue(db, A);
    const again = await enqueue(db, "https://youtu.be/aaaaaaaaaaa");
    if (!first.ok || !again.ok) throw new Error("enqueue failed");
    expect(again.id).toBe(first.id);
    expect(again.created).toBe(false);

    await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, first.id));
    const third = await enqueue(db, A);
    if (!third.ok) throw new Error("enqueue failed");
    expect(third.id).not.toBe(first.id);
  });

  test("Twitch の VOD は platform つきで登録され、重複は配信元ごとに見る", async () => {
    const T = "https://www.twitch.tv/videos/2345678901";
    const first = await enqueue(db, `${T}?t=1m`);
    const again = await enqueue(db, T);
    if (!first.ok || !again.ok) throw new Error("enqueue failed");
    expect(again.id).toBe(first.id);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, first.id));
    expect(row.platform).toBe("twitch");
    expect(row.videoId).toBe("2345678901");

    // 取得は platform を受け取り、result にも入る。
    let seen = "";
    await processNext(db, async (_id, _url, platform) => {
      seen = platform;
      return { title: "Twitch の配信", messages: parseLiveChat(sample) };
    });
    expect(seen).toBe("twitch");
    const [done] = await db.select().from(jobs).where(eq(jobs.id, first.id));
    expect(done.result).toMatchObject({ platform: "twitch", videoId: "2345678901" });

    // 同じ ID の YouTube の動画とは別物として登録できる（ID の形が重なる場合の保険）。
    await db.insert(jobs).values({ url: "x", videoId: "2345678901", platform: "youtube" });
  });

  test("不正な URL ではジョブを作らない", async () => {
    expect(await enqueue(db, "https://example.com/x")).toEqual({ ok: false, code: "invalid_url" });
    expect(await db.select().from(jobs)).toHaveLength(0);
  });

  test("チャットがない・取得失敗は、理由つきの failed になる", async () => {
    await enqueue(db, A);
    await processNext(db, async () => ({ title: "x", messages: [] }));
    await enqueue(db, B);
    await processNext(db, async () => {
      throw new JobFailure("fetch_blocked");
    });
    const rows = await db.select().from(jobs).orderBy(jobs.createdAt);
    expect(rows.map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(rows.map((r) => (r.error as { code: string }).code)).toEqual([
      "no_chat",
      "fetch_blocked",
    ]);
    expect((rows[1].error as { message: string }).message).toContain("止められました");
  });

  test("想定外の例外も fetch_failed で failed になり、ワーカーは止まらない", async () => {
    await enqueue(db, A);
    await processNext(db, async () => {
      throw new Error("boom");
    });
    const [job] = await db.select().from(jobs);
    expect(job.status).toBe("failed");
    expect((job.error as { code: string }).code).toBe("fetch_failed");
  });

  test("同時に拾っても、同じジョブを二重に取らない", async () => {
    for (let i = 0; i < 5; i++) await db.insert(jobs).values({ url: A, videoId: `vvvvvvvvvv${i}` });
    const claimed = await Promise.all(Array.from({ length: 8 }, () => claimJob(db)));
    const ids = claimed.filter((c) => c).map((c) => c?.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  test("再処理しても、コメントと集計が重複しない", async () => {
    const res = await enqueue(db, A);
    if (!res.ok) throw new Error("enqueue failed");
    await processNext(db, ok);
    await db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, res.id));
    await processNext(db, ok);
    expect(await db.select().from(chatMessages).where(eq(chatMessages.jobId, res.id))).toHaveLength(
      4,
    );
    expect(await db.select().from(chatBuckets).where(eq(chatBuckets.jobId, res.id))).toHaveLength(
      4,
    );
  });

  test("止まった running は queued に戻り、試行が3回に達していたら failed", async () => {
    const old = new Date(Date.now() - 11 * 60_000);
    await db
      .insert(jobs)
      .values({ url: A, videoId: "stale000001", status: "running", attempts: 1, updatedAt: old });
    await db
      .insert(jobs)
      .values({ url: A, videoId: "stale000002", status: "running", attempts: 3, updatedAt: old });
    await db
      .insert(jobs)
      .values({ url: A, videoId: "fresh000001", status: "running", attempts: 1 });
    await reapStale(db);
    const rows = Object.fromEntries((await db.select().from(jobs)).map((r) => [r.videoId, r]));
    expect(rows.stale000001.status).toBe("queued");
    expect(rows.stale000002.status).toBe("failed");
    expect((rows.stale000002.error as { code: string }).code).toBe("fetch_failed");
    expect(rows.fresh000001.status).toBe("running");
  });
  test("回収されて別のワーカーが拾ったジョブは、元のワーカーが上書きしない", async () => {
    const res = await enqueue(db, A);
    if (!res.ok) throw new Error("enqueue failed");
    const stale = await claimJob(db);
    if (!stale) throw new Error("claim failed");
    // 止まったとみなして回収し、別のワーカーが拾って終える
    await db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, res.id));
    const fresh = await claimJob(db);
    if (!fresh) throw new Error("claim failed");
    await runJob(db, fresh, ok);
    // 元のワーカーが遅れて終わっても、結果も状態も変わらない
    await runJob(db, stale, async () => ({ title: "古い結果", messages: parseLiveChat(sample) }));
    await runJob(db, stale, async () => ({ title: "x", messages: [] }));
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("done");
    expect((job.result as { title: string }).title).toBe("テスト配信");
    expect(await db.select().from(chatMessages).where(eq(chatMessages.jobId, res.id))).toHaveLength(
      4,
    );
  });
});
