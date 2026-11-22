import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { jobs } from "../../../../db/schema";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const db = getDb();
  const [row] = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      platform: jobs.platform,
      videoId: jobs.videoId,
      result: jobs.result,
      error: jobs.error,
      messagesPurgedAt: jobs.messagesPurgedAt,
    })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!row) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  // 完了した分析が開かれたら日時を残す（掃除の目安）。書き込みは1時間に1回まで。
  if (row.status === "done") {
    await db
      .update(jobs)
      .set({ lastOpenedAt: sql`now()` })
      .where(
        and(
          eq(jobs.id, id),
          or(isNull(jobs.lastOpenedAt), lt(jobs.lastOpenedAt, sql`now() - interval '1 hour'`)),
        ),
      );
  }
  const { messagesPurgedAt, ...job } = row;
  return Response.json({ ...job, messagesPurged: messagesPurgedAt !== null });
}
