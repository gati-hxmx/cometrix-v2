import { asc, eq, sql as q } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as schema from "../src/db/schema";
import { chatBuckets, chatMessages, jobs } from "../src/db/schema";
import { bucketize, type ChatMessage } from "../src/lib/buckets";
import { enqueue } from "../src/lib/jobs";
import { JobFailure } from "../src/worker/errors";
import type { ChatFetcher } from "../src/worker/fetch-chat";
import { claimJob, MAX_ATTEMPTS, processNext, reapStale, runJob } from "../src/worker/process";
import { fetchTwitchComments, SAVE_EVERY } from "../src/worker/twitch-chat";

// 取得の途中で失敗しても、保存済みの続きから取り直せること（#47）。
const url = process.env.TEST_DATABASE_URL;
const TWITCH = "https://www.twitch.tv/videos/1234567890";
const PER_PAGE = 500;
const PAGES = 10;

/** 1ページ500件・10ページの Twitch の応答。カーソルは "c<ページ番号>"。 */
function page(n: number) {
  const edges = Array.from({ length: PER_PAGE }, (_, i) => {
    const k = n * PER_PAGE + i;
    return {
      cursor: `c${n + 1}`,
      node: {
        contentOffsetSeconds: k / 10,
        commenter: { displayName: `user${k % 37}` },
        message: { fragments: [{ text: `msg ${k}` }] },
      },
    };
  });
  return { data: { video: { comments: { edges, pageInfo: { hasNextPage: n < PAGES - 1 } } } } };
}

/** 送られたカーソルのページを返す fetch。failAt 番目以降の呼び出しは通信エラーにする。 */
function twitchFetch(failAt: number | null) {
  const asked: number[] = [];
  let calls = 0;
  const f = (async (_u: string, init?: RequestInit) => {
    calls++;
    if (failAt !== null && calls >= failAt) throw new TypeError("fetch failed");
    const vars = JSON.parse(String(init?.body)).variables as { cursor?: string };
    const n = vars.cursor ? Number(vars.cursor.slice(1)) : 0;
    asked.push(n);
    return new Response(JSON.stringify(page(n)));
  }) as unknown as typeof fetch;
  return { f, asked };
}

const twitchFetcher =
  (f: typeof fetch): ChatFetcher =>
  async (id, _u, _p, _onProgress, resume) => ({
    title: "VOD",
    messages: await fetchTwitchComments(id, f, undefined, resume),
    saved: resume !== undefined,
  });

describe.skipIf(!url)("取得の再開（Postgres）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 5 });
  const db = drizzle(sql, { schema });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });
  beforeEach(async () => {
    await db.delete(jobs);
  });
  afterAll(async () => {
    await sql.end();
  });

  /** 再試行の待ち（RETRY_DELAY_SEC）を飛ばして、queued のジョブをすぐ拾えるようにする。 */
  async function due() {
    await db
      .update(jobs)
      .set({ updatedAt: q`now() - interval '1 second'` })
      .where(eq(jobs.status, "queued"));
  }

  async function saved(jobId: string) {
    return db
      .select({
        offsetMs: chatMessages.offsetMs,
        author: chatMessages.author,
        text: chatMessages.body,
      })
      .from(chatMessages)
      .where(eq(chatMessages.jobId, jobId))
      .orderBy(asc(chatMessages.id));
  }

  test("Twitch：途中で通信が切れたら queued に戻り、次は保存済みの続きのページから取る", async () => {
    const res = await enqueue(db, TWITCH);
    if (!res.ok) throw new Error("enqueue failed");
    // 6ページ目の取得で切れる。SAVE_EVERY（2000件）ごとに保存するので、4ページ分が残る。
    const first = twitchFetch(6);
    await processNext(db, twitchFetcher(first.f));
    const [mid] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(mid.status).toBe("queued");
    expect(mid.result).toEqual({ resume: { cursor: "c4" } });
    expect(await saved(res.id)).toHaveLength(SAVE_EVERY);
    // 続きを保存できた試行は数えない。すぐには拾わず、待ってから拾う。
    expect(mid.attempts).toBe(0);
    expect(mid.updatedAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(await processNext(db, twitchFetcher(twitchFetch(null).f))).toBe(false);
    await due();

    const second = twitchFetch(null);
    await processNext(db, twitchFetcher(second.f));
    // 取り直したのは5ページ目（c4 の続き）から最後までの6ページだけ。
    expect(second.asked).toEqual([4, 5, 6, 7, 8, 9]);

    // 途切れず取ったときと同じコメントが、同じ順で、重複も欠けもなく入る。
    const whole: ChatMessage[] = await fetchTwitchComments("x", twitchFetch(null).f);
    const rows = await saved(res.id);
    expect(rows).toEqual(whole);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("done");
    expect(job.attempts).toBe(1);
    expect(job.result).toMatchObject({ totalComments: PER_PAGE * PAGES });
    const buckets = await db
      .select({ startSec: chatBuckets.startSec, count: chatBuckets.count })
      .from(chatBuckets)
      .where(eq(chatBuckets.jobId, res.id))
      .orderBy(asc(chatBuckets.startSec));
    expect(buckets).toEqual(bucketize(whole));
  });

  test("再試行が上限に達したら failed になり、保存途中のコメントは消える", async () => {
    const res = await enqueue(db, TWITCH);
    if (!res.ok) throw new Error("enqueue failed");
    // 6回目の呼び出しから先は、ずっと通信が切れたまま。1回目は途中まで保存できたので数えず、
    // そのあと何も進まない試行が MAX_ATTEMPTS 回で failed になる。
    const down = twitchFetch(6);
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      await due();
      await processNext(db, twitchFetcher(down.f));
    }
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("failed");
    expect(job.result).toBeNull();
    expect((job.error as { code: string }).code).toBe("fetch_failed");
    expect(await saved(res.id)).toHaveLength(0);
  });

  test("再試行できない失敗（止められた・非公開）は、すぐ failed", async () => {
    const res = await enqueue(db, TWITCH);
    if (!res.ok) throw new Error("enqueue failed");
    await processNext(db, async () => {
      throw new JobFailure("fetch_blocked");
    });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
  });

  test("まとめて返す取得（YouTube）は、再試行で前の残りを消してから書き直す", async () => {
    const res = await enqueue(db, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
    if (!res.ok) throw new Error("enqueue failed");
    const many: ChatMessage[] = Array.from({ length: 4500 }, (_, i) => ({
      offsetMs: i * 100,
      author: `u${i % 7}`,
      text: `m${i}`,
    }));
    await processNext(db, async () => {
      throw new JobFailure("fetch_failed", "途中で切れた", true);
    });
    await due();
    await processNext(db, async () => ({ title: "t", messages: many }));
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("done");
    expect(await saved(res.id)).toEqual(many);
  });

  test("止まって回収されたジョブは続きの位置を残し、上限で failed なら保存途中のコメントを消す", async () => {
    const old = new Date(Date.now() - 11 * 60_000);
    const [a] = await db
      .insert(jobs)
      .values({
        url: TWITCH,
        videoId: "1111111111",
        platform: "twitch",
        status: "running",
        attempts: 1,
        result: { resume: { cursor: "c4" }, progress: { stage: "fetching", fetchedSec: 9 } },
        updatedAt: old,
      })
      .returning();
    const [b] = await db
      .insert(jobs)
      .values({
        url: TWITCH,
        videoId: "2222222222",
        platform: "twitch",
        status: "running",
        attempts: MAX_ATTEMPTS,
        result: { resume: { cursor: "c4" } },
        updatedAt: old,
      })
      .returning();
    for (const j of [a, b])
      await db.insert(chatMessages).values({ jobId: j.id, offsetMs: 0, author: "x", body: "y" });
    await reapStale(db);
    const [ra] = await db.select().from(jobs).where(eq(jobs.id, a.id));
    const [rb] = await db.select().from(jobs).where(eq(jobs.id, b.id));
    expect(ra.status).toBe("queued");
    expect(ra.result).toEqual({ resume: { cursor: "c4" } });
    expect(await saved(a.id)).toHaveLength(1);
    expect(rb.status).toBe("failed");
    expect(await saved(b.id)).toHaveLength(0);
  });

  test("回収されて別のワーカーが拾った後は、元のワーカーの保存は書かれない", async () => {
    const res = await enqueue(db, TWITCH);
    if (!res.ok) throw new Error("enqueue failed");
    // 続きの位置があるジョブにして、元のワーカーが消す処理を飛ばし、保存まで進むようにする。
    await db
      .update(jobs)
      .set({ result: { resume: { cursor: "c1" } } })
      .where(eq(jobs.id, res.id));
    const stale = await claimJob(db);
    if (!stale) throw new Error("claim failed");
    await db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, res.id));
    await due();
    const fresh = await claimJob(db);
    if (!fresh) throw new Error("claim failed");
    await runJob(db, stale, async (_i, _u, _p, _o, resume) => {
      await resume?.save([{ offsetMs: 0, author: "old", text: "古い" }], "c9");
      return { title: "古い", messages: [], saved: true };
    });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, res.id));
    expect(job.status).toBe("running");
    expect(job.attempts).toBe(fresh.attempts);
    expect(job.result).toEqual({ resume: { cursor: "c1" } });
    expect(await saved(res.id)).toHaveLength(0);
  });
});
