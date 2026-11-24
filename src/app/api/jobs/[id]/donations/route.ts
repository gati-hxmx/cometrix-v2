import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatMessages, jobs } from "../../../../../db/schema";
import { MAX_LIMIT } from "../../../../../lib/chat-filter";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 投げ銭（スパチャ・ステッカー・メンバー加入・ビッツ）を時刻順で返す。最大 MAX_LIMIT 件。 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });
  const rows = await db
    .select({
      id: chatMessages.id,
      offsetMs: chatMessages.offsetMs,
      author: chatMessages.author,
      body: chatMessages.body,
      kind: chatMessages.kind,
      amount: chatMessages.amount,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.jobId, id),
        sql`${chatMessages.offsetMs} >= 0`,
        isNotNull(chatMessages.kind),
      ),
    )
    .orderBy(asc(chatMessages.offsetMs), asc(chatMessages.id))
    .limit(MAX_LIMIT);
  return Response.json(rows);
}
