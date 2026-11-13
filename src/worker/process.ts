import { and, eq, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { chatBuckets, chatMessages, jobs } from "../db/schema";
import { bucketize, inVideo } from "../lib/buckets";
import { parseVideoUrl } from "../lib/youtube-url";
import { FAILURE_MESSAGES, type FailureCode, JobFailure } from "./errors";
import type { ChatFetcher } from "./fetch-chat";

type Db = ReturnType<typeof connect>["db"];

export const MAX_ATTEMPTS = 3;
export const STALE_MINUTES = 10;
const INSERT_CHUNK = 2000;

/** 拾ったジョブ。attempts は拾った回の番号で、終えるときに「まだ自分の担当か」を確かめるのに使う。 */
export type ClaimedJob = { id: string; url: string; attempts: number };

/** 終えてよいのは、まだ running で、拾ったときと同じ回のときだけ（回収されて別のワーカーが拾い直していない）。 */
const stillMine = (job: ClaimedJob) =>
  and(eq(jobs.id, job.id), eq(jobs.status, "running"), eq(jobs.attempts, job.attempts));

class StaleClaim extends Error {}

/** queued のジョブを古い順に1件 running にして返す。複数のワーカーが同時に呼んでも同じジョブは返らない。 */
export async function claimJob(db: Db) {
  const rows = await db.execute(sql`
    update jobs set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (select id from jobs where status = 'queued' order by created_at, id limit 1 for update skip locked)
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
      updated_at = now()
    where status = 'running' and updated_at < now() - make_interval(mins => ${STALE_MINUTES})`);
}

async function fail(db: Db, job: ClaimedJob, code: FailureCode, message: string) {
  await db
    .update(jobs)
    .set({ status: "failed", error: { code, message }, updatedAt: new Date() })
    .where(stillMine(job));
}

/** 1件のジョブを取得→集計→保存して done か failed にする。 */
export async function runJob(db: Db, job: ClaimedJob, fetchChat: ChatFetcher) {
  try {
    const parsed = parseVideoUrl(job.url);
    if (!parsed.ok) throw new JobFailure("invalid_url");
    const { title, messages } = await fetchChat(parsed.videoId, parsed.url, parsed.platform);
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
            totalComments: valid.length,
            lastBucketSec: buckets[buckets.length - 1].startSec,
          },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
    });
  } catch (e) {
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
