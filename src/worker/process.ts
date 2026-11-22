import { and, eq, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { chatBuckets, chatMessages, jobs } from "../db/schema";
import { bucketize, inVideo } from "../lib/buckets";
import { maxConcurrentFetch } from "../lib/limits";
import type { FetchProgress } from "../lib/progress";
import { parseVideoUrl } from "../lib/youtube-url";
import { FAILURE_MESSAGES, type FailureCode, JobFailure } from "./errors";
import type { ChatFetcher } from "./fetch-chat";

type Db = ReturnType<typeof connect>["db"];

export const MAX_ATTEMPTS = 3;
export const STALE_MINUTES = 10;
const INSERT_CHUNK = 2000;
/** 進み具合を DB に書く間隔の下限。 */
export const PROGRESS_WRITE_MS = 2000;

/** 拾ったジョブ。attempts は拾った回の番号で、終えるときに「まだ自分の担当か」を確かめるのに使う。 */
export type ClaimedJob = { id: string; url: string; attempts: number };

/** 終えてよいのは、まだ running で、拾ったときと同じ回のときだけ（回収されて別のワーカーが拾い直していない）。 */
const stillMine = (job: ClaimedJob) =>
  and(eq(jobs.id, job.id), eq(jobs.status, "running"), eq(jobs.attempts, job.attempts));

class StaleClaim extends Error {}

/**
 * queued のジョブを古い順に1件 running にして返す。複数のワーカーが同時に呼んでも同じジョブは返らない。
 * running が maxRunning 以上のときは拾わない（ワーカーが同時に拾う瞬間は、1〜2件超えることがある）。
 */
export async function claimJob(db: Db, maxRunning = maxConcurrentFetch()) {
  const rows = await db.execute(sql`
    update jobs set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (select id from jobs where status = 'queued' order by created_at, id limit 1 for update skip locked)
      and (select count(*) from jobs where status = 'running') < ${maxRunning}
    returning id, url, attempts`);
  return (rows[0] as ClaimedJob | undefined) ?? null;
}

/** running のまま止まったジョブを queued に戻す。試行が上限に達していれば failed にする。 */
export async function reapStale(db: Db) {
  const failed = JSON.stringify({
    code: "fetch_failed",
    message: `${FAILURE_MESSAGES.fetch_failed}（処理が途中で止まりました）`,
  });
  await db.execute(sql`
    update jobs set
      status = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
      error = case when attempts >= ${MAX_ATTEMPTS} then ${failed}::jsonb else error end,
      result = null,
      updated_at = now()
    where status = 'running' and updated_at < now() - make_interval(mins => ${STALE_MINUTES})`);
}

async function fail(db: Db, job: ClaimedJob, code: FailureCode, message: string) {
  await db
    .update(jobs)
    .set({ status: "failed", error: { code, message }, result: null, updatedAt: new Date() })
    .where(stillMine(job));
}

/**
 * 取得中の進み具合を jobs.result に書く係（#43）。間隔を空け、書き込みは同時に1つだけにする。
 * updated_at も進むので、長い取得でも「途中で止まった」と回収されない。
 */
export function progressWriter(db: Db, job: ClaimedJob, minIntervalMs = PROGRESS_WRITE_MS) {
  let last = 0;
  let inflight: Promise<unknown> = Promise.resolve();
  let busy = false;
  let closed = false;
  const write = (p: FetchProgress) => {
    busy = true;
    inflight = db
      .update(jobs)
      .set({ result: { progress: p }, updatedAt: new Date() })
      .where(stillMine(job))
      .catch((e) => console.error("progress write failed", e))
      .finally(() => {
        busy = false;
      });
    return inflight;
  };
  return {
    report(p: FetchProgress) {
      const now = Date.now();
      if (closed || busy || now - last < minIntervalMs) return;
      last = now;
      void write(p);
    },
    /** 書きかけを待ってから、最後の状態を書く。 */
    async flush(p: FetchProgress) {
      closed = true;
      await inflight;
      await write(p);
    },
    settle: () => {
      closed = true;
      return inflight;
    },
  };
}

/** 1件のジョブを取得→集計→保存して done か failed にする。 */
export async function runJob(db: Db, job: ClaimedJob, fetchChat: ChatFetcher) {
  const progress = progressWriter(db, job);
  try {
    const parsed = parseVideoUrl(job.url);
    if (!parsed.ok) throw new JobFailure("invalid_url");
    let lastProgress: FetchProgress | null = null;
    const { title, messages, clips } = await fetchChat(
      parsed.videoId,
      parsed.url,
      parsed.platform,
      (p) => {
        lastProgress = p;
        progress.report(p);
      },
    );
    const done = lastProgress as FetchProgress | null;
    await progress.flush({
      stage: "saving",
      fetchedSec: done?.fetchedSec ?? 0,
      durationSec: done?.durationSec ?? null,
    });
    const valid = inVideo(messages);
    if (valid.length === 0) throw new JobFailure("no_chat");
    const buckets = bucketize(valid);

    await db.transaction(async (tx) => {
      // 先にジョブの行をロックして担当を確かめる。回収されて別のワーカーのものになっていれば何も書かない。
      const mine = await tx
        .update(jobs)
        .set({ updatedAt: new Date() })
        .where(stillMine(job))
        .returning({ id: jobs.id });
      if (mine.length === 0) throw new StaleClaim();
      await tx.delete(chatMessages).where(eq(chatMessages.jobId, job.id));
      await tx.delete(chatBuckets).where(eq(chatBuckets.jobId, job.id));
      for (let i = 0; i < valid.length; i += INSERT_CHUNK) {
        await tx.insert(chatMessages).values(
          valid.slice(i, i + INSERT_CHUNK).map((m) => ({
            jobId: job.id,
            offsetMs: m.offsetMs,
            author: m.author,
            body: m.text,
            kind: m.kind ?? null,
            amount: m.amount ?? null,
          })),
        );
      }
      await tx
        .insert(chatBuckets)
        .values(buckets.map((b) => ({ jobId: job.id, startSec: b.startSec, count: b.count })));
      await tx
        .update(jobs)
        .set({
          status: "done",
          error: null,
          result: {
            platform: parsed.platform,
            videoId: parsed.videoId,
            title,
            clips: clips ?? [],
            totalComments: valid.length,
            lastBucketSec: buckets[buckets.length - 1].startSec,
          },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
    });
  } catch (e) {
    await progress.settle();
    if (e instanceof StaleClaim) return;
    if (e instanceof JobFailure) await fail(db, job, e.code, e.message);
    else
      await fail(
        db,
        job,
        "fetch_failed",
        `${FAILURE_MESSAGES.fetch_failed}（${String((e as Error).message).slice(0, 300)}）`,
      );
  }
}

/** 1件処理した（または失敗にした）ら true、待ちがなければ false。 */
export async function processNext(db: Db, fetchChat: ChatFetcher): Promise<boolean> {
  const job = await claimJob(db);
  if (!job) return false;
  await runJob(db, job, fetchChat);
  return true;
}
