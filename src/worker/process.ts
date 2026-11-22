import { and, eq, type SQL, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { chatBuckets, chatMessages, jobs } from "../db/schema";
import { BUCKET_SECONDS, type ChatMessage, inVideo } from "../lib/buckets";
import { maxConcurrentFetch } from "../lib/limits";
import type { FetchProgress } from "../lib/progress";
import { parseVideoUrl } from "../lib/youtube-url";
import { FAILURE_MESSAGES, type FailureCode, JobFailure } from "./errors";
import type { ChatFetcher, FetchResume } from "./fetch-chat";

type Db = ReturnType<typeof connect>["db"];

export const MAX_ATTEMPTS = 3;
export const STALE_MINUTES = 10;
/** 再試行までの待ち（秒）。試行回数をかける（1回目の失敗の後は30秒、2回目の後は60秒）。 */
export const RETRY_DELAY_SEC = 30;
const INSERT_CHUNK = 2000;
/** 進み具合を DB に書く間隔の下限。 */
export const PROGRESS_WRITE_MS = 2000;

/**
 * 拾ったジョブ。attempts は拾った回の番号で、終えるときに「まだ自分の担当か」を確かめるのに使う。
 * result は拾ったときの jobs.result で、前の試行の続きの位置（{ resume }）が入っていることがある（#47）。
 */
export type ClaimedJob = { id: string; url: string; attempts: number; result?: unknown };

/** 前の試行で保存したところまでの印。cursor が null なら最後まで取ってある。 */
export type ResumeState = { cursor: string | null };

export function readResume(result: unknown): ResumeState | null {
  const r = (result as { resume?: { cursor?: unknown } } | null)?.resume;
  if (!r || typeof r !== "object") return null;
  return { cursor: typeof r.cursor === "string" ? r.cursor : null };
}

/** jobs.result から続きの位置だけを残す式。queued に戻すときに使う（進み具合は消す）。 */
const keepResume = sql`case when ${jobs.result} ? 'resume' then jsonb_build_object('resume', ${jobs.result}->'resume') else null end`;

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
    where id = (
      select id from jobs where status = 'queued' and updated_at <= now()
      order by created_at, id limit 1 for update skip locked)
      and (select count(*) from jobs where status = 'running') < ${maxRunning}
    returning id, url, attempts, result`);
  return (rows[0] as ClaimedJob | undefined) ?? null;
}

/**
 * running のまま止まったジョブを queued に戻す。試行が上限に達していれば failed にする。
 * queued に戻すときは続きの位置（result.resume）を残し、failed にするときは保存途中のコメントを消す（#47）。
 */
export async function reapStale(db: Db) {
  const failed = JSON.stringify({
    code: "fetch_failed",
    message: `${FAILURE_MESSAGES.fetch_failed}（処理が途中で止まりました）`,
  });
  await db.execute(sql`
    with reaped as (
      update jobs set
        status = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
        error = case when attempts >= ${MAX_ATTEMPTS} then ${failed}::jsonb else error end,
        result = case when attempts >= ${MAX_ATTEMPTS} then null else ${keepResume} end,
        updated_at = now()
      where status = 'running' and updated_at < now() - make_interval(mins => ${STALE_MINUTES})
      returning id, status
    )
    delete from chat_messages where job_id in (select id from reaped where status = 'failed')`);
}

/** 失敗にして、保存途中のコメントを消す。 */
async function fail(db: Db, job: ClaimedJob, code: FailureCode, message: string) {
  await db.transaction(async (tx) => {
    const mine = await tx
      .update(jobs)
      .set({ status: "failed", error: { code, message }, result: null, updatedAt: new Date() })
      .where(stillMine(job))
      .returning({ id: jobs.id });
    if (mine.length > 0) await tx.delete(chatMessages).where(eq(chatMessages.jobId, job.id));
  });
}

/** 再試行できる失敗で、試行が残っていれば queued に戻す（続きの位置は残す）。戻したら true。 */
/**
 * 再試行できる失敗で、試行が残っていれば queued に戻す（続きの位置は残す）。戻したら true。
 * すぐ拾い直すと同じ一時的な失敗に当たるので、RETRY_DELAY_SEC × 試行回数のあいだは拾わない（updated_at を先にする）。
 * この試行で続きの位置が進んだ（保存できた）ときは、試行に数えない。長い配信で、離れた所で何回か切れても
 * 保存済みを捨てないため。進んだ分だけ終わりに近づくので、いつまでも繰り返すことはない。
 */
async function retryLater(db: Db, job: ClaimedJob, progressed: boolean) {
  if (job.attempts >= MAX_ATTEMPTS && !progressed) return false;
  await db
    .update(jobs)
    .set({
      status: "queued",
      result: keepResume,
      attempts: progressed ? job.attempts - 1 : job.attempts,
      updatedAt: sql`now() + make_interval(secs => ${RETRY_DELAY_SEC * job.attempts})`,
    })
    .where(stillMine(job));
  return true;
}

/** まだ自分の担当なら updated_at を進めて行をロックする。担当でなければ StaleClaim。 */
async function lockMine(tx: Pick<Db, "update">, job: ClaimedJob, result?: SQL) {
  const mine = await tx
    .update(jobs)
    .set(result ? { result, updatedAt: new Date() } : { updatedAt: new Date() })
    .where(stillMine(job))
    .returning({ id: jobs.id });
  if (mine.length === 0) throw new StaleClaim();
}

/** まだ自分の担当なら、このジョブのコメントを消す。 */
async function clearMessages(db: Db, job: ClaimedJob) {
  await db.transaction(async (tx) => {
    await lockMine(tx, job);
    await tx.delete(chatMessages).where(eq(chatMessages.jobId, job.id));
  });
}

const toRows = (jobId: string, messages: ChatMessage[]) =>
  messages.map((m) => ({ jobId, offsetMs: m.offsetMs, author: m.author, body: m.text }));

/**
 * コメントを INSERT_CHUNK 件ずつ、別々のトランザクションで足す。1つずつ担当を確かめて updated_at を進めるので、
 * 長い保存でも「止まった」と回収されず、回収された後は書かない（#47）。
 */
async function insertChunks(db: Db, job: ClaimedJob, messages: ChatMessage[]) {
  for (let i = 0; i < messages.length; i += INSERT_CHUNK) {
    await db.transaction(async (tx) => {
      await lockMine(tx, job);
      await tx.insert(chatMessages).values(toRows(job.id, messages.slice(i, i + INSERT_CHUNK)));
    });
  }
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
      // 続きの位置（result.resume）は残し、進み具合だけを置き換える。
      .set({
        result: sql`coalesce(${jobs.result}, '{}'::jsonb) || ${JSON.stringify({ progress: p })}::jsonb`,
        updatedAt: new Date(),
      })
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

/**
 * 1件のジョブを取得→保存→集計して done か failed にする。
 * 再試行できる失敗（JobFailure.retryable）は、試行が残っていれば queued に戻す。
 * Twitch は取得しながら保存して続きの位置を残すので、次の試行は続きから取る（#47）。
 */
export async function runJob(db: Db, job: ClaimedJob, fetchChat: ChatFetcher) {
  const progress = progressWriter(db, job);
  // この試行で続きの位置を保存できたか（再試行の数え方に使う）。
  let progressed = false;
  try {
    const parsed = parseVideoUrl(job.url);
    if (!parsed.ok) throw new JobFailure("invalid_url");
    // 続きの位置がなければ、前の試行のコメントは残っていても使わない。
    // 最後まで取ってあった（cursor が null）ときも、タイトルなどを取り直すため最初から取る。
    const prev = readResume(job.result)?.cursor ? readResume(job.result) : null;
    if (!prev) await clearMessages(db, job);
    let lastProgress: FetchProgress | null = null;
    const resume: FetchResume = {
      cursor: prev?.cursor ?? null,
      // コメントと続きの位置を同じトランザクションで書くので、どこで落ちても二重・抜けにならない。
      save: (messages, cursor) =>
        db
          .transaction(async (tx) => {
            await lockMine(
              tx,
              job,
              sql`coalesce(${jobs.result}, '{}'::jsonb) || ${JSON.stringify({ resume: { cursor } })}::jsonb`,
            );
            const rows = toRows(job.id, inVideo(messages));
            for (let i = 0; i < rows.length; i += INSERT_CHUNK)
              await tx.insert(chatMessages).values(rows.slice(i, i + INSERT_CHUNK));
          })
          .then(() => {
            progressed = true;
          }),
    };
    const fetched = await fetchChat(
      parsed.videoId,
      parsed.url,
      parsed.platform,
      (p) => {
        lastProgress = p;
        progress.report(p);
      },
      resume,
    );
    const done = lastProgress as FetchProgress | null;
    await progress.flush({
      stage: "saving",
      fetchedSec: done?.fetchedSec ?? 0,
      durationSec: done?.durationSec ?? null,
    });
    if (!fetched.saved) {
      // まとめて返す取得（YouTube）は、前の試行の残りを消してから少しずつ書く。
      await clearMessages(db, job);
      await insertChunks(db, job, inVideo(fetched.messages));
    }

    await db.transaction(async (tx) => {
      // 先にジョブの行をロックして担当を確かめる。回収されて別のワーカーのものになっていれば何も書かない。
      await lockMine(tx, job);
      await tx.delete(chatBuckets).where(eq(chatBuckets.jobId, job.id));
      // 0秒から最後のコメントの区間まで、0件の区間も含めて30秒ごとに数える（lib/buckets.ts の bucketize と同じ）。
      const [stats] = await tx.execute(sql`
        with c as (
          select ${chatMessages.offsetMs} / ${BUCKET_SECONDS * 1000} as b
          from ${chatMessages} where ${chatMessages.jobId} = ${job.id}
        ),
        ins as (
          insert into chat_buckets (job_id, start_sec, count)
          select ${job.id}, s * ${BUCKET_SECONDS}, coalesce(n.cnt, 0)
          from generate_series(0, (select max(b) from c)) s
          left join (select b, count(*)::int as cnt from c group by b) n on n.b = s
          returning start_sec
        )
        select (select count(*)::int from c) as total, (select max(start_sec) from ins) as "lastBucketSec"`);
      const total = Number(stats?.total ?? 0);
      if (total === 0) throw new JobFailure("no_chat");
      await tx
        .update(jobs)
        .set({
          status: "done",
          error: null,
          result: {
            platform: parsed.platform,
            videoId: parsed.videoId,
            title: fetched.title,
            clips: fetched.clips ?? [],
            totalComments: total,
            lastBucketSec: Number(stats.lastBucketSec),
          },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
    });
  } catch (e) {
    await progress.settle();
    if (e instanceof StaleClaim) return;
    if (e instanceof JobFailure) {
      if (e.retryable && (await retryLater(db, job, progressed))) return;
      await fail(db, job, e.code, e.message);
    } else
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
