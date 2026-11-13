import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatMessages, jobs } from "../../../../../db/schema";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseFilter,
  parseIntParam,
} from "../../../../../lib/chat-filter";
import { filterConds } from "../../../../../lib/chat-sql";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = () => Response.json({ error: { code: "bad_request" } }, { status: 400 });

/** aroundSec に近いコメントを最大 limit 件、時刻順で返す。q・user で絞り込める。 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const params = new URL(req.url).searchParams;
  const f = parseFilter(params);
  const around = parseIntParam(params.get("aroundSec"), 0);
  const limit = parseIntParam(params.get("limit"), DEFAULT_LIMIT);
  if (!f.ok || around === null || limit === null || limit < 1 || limit > MAX_LIMIT) return bad();

  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });

  const conds: SQL[] = [eq(chatMessages.jobId, id), sql`${chatMessages.offsetMs} >= 0`];
  conds.push(...filterConds(f.filter));
  // (job_id, offset_ms) の索引で読めるよう、前と後ろをそれぞれ limit 件までに絞ってから近い順に選ぶ。
  const cols = {
    id: chatMessages.id,
    offsetMs: chatMessages.offsetMs,
    author: chatMessages.author,
    body: chatMessages.body,
  };
  const at = around * 1000;
  const [before, after] = await Promise.all([
    db
      .select(cols)
      .from(chatMessages)
      .where(and(...conds, sql`${chatMessages.offsetMs} <= ${at}`))
      .orderBy(desc(chatMessages.offsetMs), desc(chatMessages.id))
      .limit(limit),
    db
      .select(cols)
      .from(chatMessages)
      .where(and(...conds, sql`${chatMessages.offsetMs} > ${at}`))
      .orderBy(asc(chatMessages.offsetMs), asc(chatMessages.id))
      .limit(limit),
  ]);
  const rows = [...before, ...after]
    .sort((a, b) => Math.abs(a.offsetMs - at) - Math.abs(b.offsetMs - at) || a.id - b.id)
    .slice(0, limit)
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id - b.id);
  return Response.json(rows);
}
