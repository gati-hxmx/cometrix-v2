import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatBuckets, jobs } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 30秒ごとのコメント数。分析が終わっていない（done 以外）ときは 409。 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });
  const rows = await db
    .select({ startSec: chatBuckets.startSec, count: chatBuckets.count })
    .from(chatBuckets)
    .where(eq(chatBuckets.jobId, id))
    .orderBy(asc(chatBuckets.startSec));
  return Response.json(rows);
}
