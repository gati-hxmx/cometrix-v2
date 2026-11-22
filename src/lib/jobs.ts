import { and, eq, ne, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { chatBuckets, chatMessages, jobs } from "../db/schema";
import { parseVideoUrl } from "./youtube-url";

type Db = ReturnType<typeof connect>["db"];

export type EnqueueResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; code: "invalid_url" };

/** URL を検証してジョブを作る。同じ動画の failed 以外のジョブがあれば、それを返す。 */
export async function enqueue(db: Db, input: string): Promise<EnqueueResult> {
  const parsed = parseVideoUrl(input);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  const inserted = await db
    .insert(jobs)
    .values({ url: parsed.url, videoId: parsed.videoId, platform: parsed.platform })
    .onConflictDoNothing({
      target: [jobs.platform, jobs.videoId],
      where: sql`${jobs.status} <> 'failed'`,
    })
    .returning({ id: jobs.id });
  if (inserted[0]) return { ok: true, id: inserted[0].id, created: true };
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.platform, parsed.platform),
        eq(jobs.videoId, parsed.videoId),
        ne(jobs.status, "failed"),
      ),
    )
    .limit(1);
  if (existing) return { ok: true, id: existing.id, created: false };
  // 競合の直後に failed へ変わった場合は、もう一度作る。
  return enqueue(db, input);
}

/** 分析し直しの間隔。連打で配信元に止められないよう、最後の更新からこれだけあける（#99）。 */
export const REANALYZE_COOLDOWN_SEC = 60;

/** 最後の更新から、あと何秒で分析し直せるか（0 なら今すぐ）。 */
export function retryAfterSec(updatedAt: Date, now = new Date()): number {
  const left = REANALYZE_COOLDOWN_SEC - (now.getTime() - updatedAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(left));
}

export type ReanalyzeResult =
  | { ok: true; id: string }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "busy" }
  | { ok: false; code: "too_soon"; retryAfterSec: number }
  | { ok: false; code: "duplicate"; id: string };

/**
 * done／failed の分析のコメント・集計を消し、同じ ID のまま queued に戻す（#99）。
 * ID を変えないので、URL とブラウザのメモはそのまま残る。
 */
export async function reanalyze(db: Db, id: string): Promise<ReanalyzeResult> {
  return db.transaction(async (tx): Promise<ReanalyzeResult> => {
    // 行をロックして状態を確かめる（連打しても1回だけ通る）。
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
    if (!job) return { ok: false, code: "not_found" };
    if (job.status === "queued" || job.status === "running") return { ok: false, code: "busy" };
    const wait = retryAfterSec(job.updatedAt);
    if (wait > 0) return { ok: false, code: "too_soon", retryAfterSec: wait };
    if (job.status === "failed" && job.videoId) {
      const [other] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.platform, job.platform),
            eq(jobs.videoId, job.videoId),
            ne(jobs.status, "failed"),
          ),
        )
        .limit(1);
      if (other) return { ok: false, code: "duplicate", id: other.id };
    }
    await tx.delete(chatMessages).where(eq(chatMessages.jobId, id));
    await tx.delete(chatBuckets).where(eq(chatBuckets.jobId, id));
    await tx
      .update(jobs)
      .set({
        status: "queued",
        attempts: 0,
        result: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id));
    return { ok: true, id };
  });
}
