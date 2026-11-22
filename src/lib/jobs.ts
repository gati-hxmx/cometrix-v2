import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { connect } from "../db/client";
import { jobs } from "../db/schema";
import { maxPendingJobs } from "./limits";
import { parseVideoUrl } from "./youtube-url";

type Db = ReturnType<typeof connect>["db"];

export type EnqueueResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; code: "invalid_url" | "busy" };

/** URL を検証してジョブを作る。同じ動画の failed 以外のジョブがあれば、それを返す。未完了が多すぎるときは断る。 */
export async function enqueue(db: Db, input: string): Promise<EnqueueResult> {
  const parsed = parseVideoUrl(input);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  const findExisting = async () =>
    (
      await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.platform, parsed.platform),
            eq(jobs.videoId, parsed.videoId),
            ne(jobs.status, "failed"),
          ),
        )
        .limit(1)
    )[0];

  // すでにある動画は、混んでいても同じジョブを返す。
  const before = await findExisting();
  if (before) return { ok: true, id: before.id, created: false };

  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "running"]));
  if (pending.n >= maxPendingJobs()) return { ok: false, code: "busy" };

  const inserted = await db
    .insert(jobs)
    .values({ url: parsed.url, videoId: parsed.videoId, platform: parsed.platform })
    .onConflictDoNothing({
      target: [jobs.platform, jobs.videoId],
      where: sql`${jobs.status} <> 'failed'`,
    })
    .returning({ id: jobs.id });
  if (inserted[0]) return { ok: true, id: inserted[0].id, created: true };
  const existing = await findExisting();
  if (existing) return { ok: true, id: existing.id, created: false };
  // 競合の直後に failed へ変わった場合は、もう一度作る。
  return enqueue(db, input);
}
