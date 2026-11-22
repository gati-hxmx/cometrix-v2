import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { enqueue, REANALYZE_COOLDOWN_SEC, reanalyze, retryAfterSec } from "../src/lib/jobs";
import { parseLiveChat } from "../src/worker/chat-parse";
import { processNext } from "../src/worker/process";

// 分析し直し（#99）。Postgres があるときだけ動かす。
const url = process.env.TEST_DATABASE_URL;
const sample = readFileSync(new URL("./fixtures/live_chat.sample.jsonl", import.meta.url), "utf8");
const A = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
const OLD = () => new Date(Date.now() - (REANALYZE_COOLDOWN_SEC + 5) * 1000);

describe("待ち時間の計算", () => {
  const now = new Date("2026-01-01T00:10:00Z");
  test("最後の更新から60秒たつまでは残りの秒数、たてば 0", () => {
    expect(retryAfterSec(new Date("2026-01-01T00:09:59Z"), now)).toBe(59);
    expect(retryAfterSec(new Date("2026-01-01T00:09:00Z"), now)).toBe(0);
    expect(retryAfterSec(new Date("2026-01-01T00:00:00Z"), now)).toBe(0);
  });
});

describe.skipIf(!url)("分析し直し（Postgres）", () => {
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

  async function doneJob() {
    const res = await enqueue(db, A);
    if (!res.ok) throw new Error("enqueue failed");
    await processNext(db, ok);
    return res.id;
  }

  test("done の分析は、コメントと集計を消して同じ ID のまま queued に戻り、取り直せる", async () => {
    const id = await doneJob();
    await db.update(jobs).set({ updatedAt: OLD() }).where(eq(jobs.id, id));
    expect(await reanalyze(db, id)).toEqual({ ok: true, id });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(job).toMatchObject({ status: "queued", attempts: 0, result: null, error: null });
    expect(await db.select().from(chatMessages).where(eq(chatMessages.jobId, id))).toHaveLength(0);
    expect(await db.select().from(chatBuckets).where(eq(chatBuckets.jobId, id))).toHaveLength(0);

    expect(await processNext(db, ok)).toBe(true);
    const [again] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(again.status).toBe("done");
    expect(await db.select().from(chatMessages).where(eq(chatMessages.jobId, id))).toHaveLength(4);
  });

  test("failed の分析も取り直せる", async () => {
    const id = await doneJob();
    await db
      .update(jobs)
      .set({ status: "failed", error: { code: "fetch_failed", message: "x" }, updatedAt: OLD() })
      .where(eq(jobs.id, id));
    expect(await reanalyze(db, id)).toEqual({ ok: true, id });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(job).toMatchObject({ status: "queued", error: null });
  });

  test("queued・running のときは busy で、何も消さない", async () => {
    const id = await doneJob();
    for (const status of ["queued", "running"] as const) {
      await db.update(jobs).set({ status, updatedAt: OLD() }).where(eq(jobs.id, id));
      expect(await reanalyze(db, id)).toEqual({ ok: false, code: "busy" });
    }
    expect(await db.select().from(chatMessages).where(eq(chatMessages.jobId, id))).toHaveLength(4);
  });

  test("60秒たっていないときは too_soon で、何も消さない。連打しても1回だけ通る", async () => {
    const id = await doneJob();
    const res = await reanalyze(db, id);
    expect(res).toMatchObject({ ok: false, code: "too_soon" });
    expect(await db.select().from(chatMessages).where(eq(chatMessages.jobId, id))).toHaveLength(4);

    await db.update(jobs).set({ updatedAt: OLD() }).where(eq(jobs.id, id));
    const results = await Promise.all([reanalyze(db, id), reanalyze(db, id), reanalyze(db, id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  test("存在しない ID は not_found", async () => {
    expect(await reanalyze(db, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  test("failed の後に同じ動画の新しい分析があれば duplicate で、その ID を返す", async () => {
    const first = await doneJob();
    await db.update(jobs).set({ status: "failed", updatedAt: OLD() }).where(eq(jobs.id, first));
    const second = await enqueue(db, A);
    if (!second.ok) throw new Error("enqueue failed");
    expect(await reanalyze(db, first)).toEqual({ ok: false, code: "duplicate", id: second.id });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, first));
    expect(job.status).toBe("failed");
  });
});
