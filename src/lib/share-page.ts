import { and, asc, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "../db/client";
import { chatBuckets, jobs } from "../db/schema";
import type { Bucket } from "./buckets";
import { SHARE_TOKEN } from "./share-link";

/** 共有ページに出すもの（#68）。コメントの本文・名前・メモ・分析の ID は入れない。 */
export type Shared = {
  title: string;
  platform: "youtube" | "twitch";
  videoId: string;
  totalComments: number;
  buckets: Bucket[];
};

/** 鍵から共有ページの中身を読む。鍵が無い・共有をやめた・分析が終わっていなければ null。 */
export async function loadShared(
  db: ReturnType<typeof getDb>,
  token: string,
): Promise<Shared | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  const [job] = await db
    .select({ id: jobs.id, status: jobs.status, platform: jobs.platform, result: jobs.result })
    .from(jobs)
    .where(and(eq(jobs.shareToken, token), isNotNull(jobs.sharedAt)));
  if (job?.status !== "done") return null;
  const r = (job.result ?? {}) as { title?: unknown; videoId?: unknown; totalComments?: unknown };
  if (typeof r.videoId !== "string") return null;
  const buckets = await db
    .select({ startSec: chatBuckets.startSec, count: chatBuckets.count })
    .from(chatBuckets)
    .where(eq(chatBuckets.jobId, job.id))
    .orderBy(asc(chatBuckets.startSec));
  return {
    title: typeof r.title === "string" ? r.title : "",
    platform: job.platform,
    videoId: r.videoId,
    totalComments: typeof r.totalComments === "number" ? r.totalComments : 0,
    buckets,
  };
}

/** 1回の表示（メタデータ・ページ）で同じ鍵を2回読まないよう、リクエストの中でまとめる */
export const loadSharedCached = cache((token: string) => loadShared(getDb(), token));
