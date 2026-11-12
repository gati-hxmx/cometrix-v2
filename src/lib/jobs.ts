import { and, eq, ne, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { jobs } from "../db/schema";
import { parseVideoUrl } from "./youtube-url";

type Db = ReturnType<typeof connect>["db"];

export type EnqueueResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; code: "invalid_url" | "unsupported_url" };

/** URL を検証してジョブを作る。同じ動画の failed 以外のジョブがあれば、それを返す。 */
export async function enqueue(db: Db, input: string): Promise<EnqueueResult> {
  const parsed = parseVideoUrl(input);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  const inserted = await db
    .insert(jobs)
    .values({ url: parsed.url, videoId: parsed.videoId })
    .onConflictDoNothing({ target: jobs.videoId, where: sql`${jobs.status} <> 'failed'` })
    .returning({ id: jobs.id });
  if (inserted[0]) return { ok: true, id: inserted[0].id, created: true };
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.videoId, parsed.videoId), ne(jobs.status, "failed")))
    .limit(1);
  if (existing) return { ok: true, id: existing.id, created: false };
  // 競合の直後に failed へ変わった場合は、もう一度作る。
  return enqueue(db, input);
}
