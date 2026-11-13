import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatBuckets, chatMessages, jobs } from "../../../../../db/schema";
import { fillBuckets, parseFilter } from "../../../../../lib/chat-filter";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 30秒ごとのコメント数。分析が終わっていない（done 以外）ときは 409。
 * q・user があるときは、一致したコメントだけを同じ区間で数える。
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const f = parseFilter(new URL(req.url).searchParams);
  if (!f.ok) return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });

  if (f.q === null && f.user === null) {
    const rows = await db
      .select({ startSec: chatBuckets.startSec, count: chatBuckets.count })
      .from(chatBuckets)
      .where(eq(chatBuckets.jobId, id))
      .orderBy(asc(chatBuckets.startSec));
    return Response.json(rows);
  }

  const conds = [eq(chatMessages.jobId, id), sql`${chatMessages.offsetMs} >= 0`];
  if (f.q !== null) conds.push(sql`strpos(lower(${chatMessages.body}), ${f.q}) > 0`);
  if (f.user !== null) conds.push(sql`strpos(lower(${chatMessages.author}), ${f.user}) > 0`);
  const start = sql<number>`(floor(${chatMessages.offsetMs} / 30000) * 30)::int`;
  const found = await db
    .select({ startSec: start, count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(and(...conds))
    .groupBy(start);
  // 棒の位置がずれないよう、絞り込まない集計と同じ長さにそろえる。
  const [last] = await db
    .select({ startSec: chatBuckets.startSec })
    .from(chatBuckets)
    .where(eq(chatBuckets.jobId, id))
    .orderBy(desc(chatBuckets.startSec))
    .limit(1);
  return Response.json(fillBuckets(found, last?.startSec ?? 0));
}
