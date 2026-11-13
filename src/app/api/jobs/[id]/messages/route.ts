import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatMessages, jobs } from "../../../../../db/schema";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseFilter,
  parseIntParam,
} from "../../../../../lib/chat-filter";

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
  if (f.q !== null) conds.push(sql`strpos(lower(${chatMessages.body}), ${f.q}) > 0`);
  if (f.user !== null) conds.push(sql`strpos(lower(${chatMessages.author}), ${f.user}) > 0`);
  const near = db
    .select({
      id: chatMessages.id,
      offsetMs: chatMessages.offsetMs,
      author: chatMessages.author,
      body: chatMessages.body,
    })
    .from(chatMessages)
    .where(and(...conds))
    .orderBy(sql`abs(${chatMessages.offsetMs} - ${around * 1000})`, asc(chatMessages.id))
    .limit(limit)
    .as("near");
  const rows = await db.select().from(near).orderBy(asc(near.offsetMs), asc(near.id));
  return Response.json(rows);
}
