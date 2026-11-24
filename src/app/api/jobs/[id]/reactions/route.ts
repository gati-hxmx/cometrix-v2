import { desc, eq, type SQL, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatBuckets, chatMessages, jobs } from "../../../../../db/schema";
import { parseFilter } from "../../../../../lib/chat-filter";
import {
  FILTER_TIMEOUT_MS,
  filterConds,
  isBadPatternError,
  reactionCase,
  spamFreeSource,
} from "../../../../../lib/chat-sql";
import {
  emptyReactionBucket,
  REACTION_KINDS,
  type ReactionBucket,
  type ReactionKind,
} from "../../../../../lib/reactions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 30秒ごとの、反応の種類ごとのコメント数（#62。種類は lib/reactions.ts）。分析が終わっていないときは 409。
 * q・user などの絞り込みと spam=1 は、コメント数のグラフ（buckets）と同じ意味で使える。
 * 長さは絞り込まない集計とそろえる（棒の位置がずれないように）。
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const params = new URL(req.url).searchParams;
  const f = parseFilter(params);
  const spamParam = params.get("spam");
  if (spamParam !== null && spamParam !== "1" && spamParam !== "0")
    return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  if (!f.ok) return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const spam = spamParam === "1";
  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });

  const conds: SQL[] = [...filterConds(f.filter)];
  if (!spam) conds.push(sql`${chatMessages.jobId} = ${id}`, sql`${chatMessages.offsetMs} >= 0`);
  const from = spam ? spamFreeSource(id) : sql`${chatMessages}`;
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  const start = sql`(floor(${chatMessages.offsetMs} / 30000) * 30)::int`;
  let rows: { startSec: number; kind: ReactionKind; count: number }[];
  try {
    rows = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('statement_timeout', ${String(FILTER_TIMEOUT_MS)}, true)`,
      );
      const r = await tx.execute(
        sql`select ${start} as "startSec", ${reactionCase()} as "kind", count(*)::int as "count" from ${from} ${where} group by 1, 2`,
      );
      return Array.from(r, (x) => ({
        startSec: Number(x.startSec),
        kind: String(x.kind) as ReactionKind,
        count: Number(x.count),
      }));
    });
  } catch (e) {
    if (isBadPatternError(e))
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
    throw e;
  }
  const [last] = await db
    .select({ startSec: chatBuckets.startSec })
    .from(chatBuckets)
    .where(eq(chatBuckets.jobId, id))
    .orderBy(desc(chatBuckets.startSec))
    .limit(1);
  const lastSec = Math.max(last?.startSec ?? 0, ...rows.map((r) => r.startSec));
  const out: ReactionBucket[] = [];
  for (let s = 0; s <= lastSec; s += 30) out.push(emptyReactionBucket(s));
  for (const r of rows)
    if (r.startSec >= 0 && REACTION_KINDS.includes(r.kind)) out[r.startSec / 30][r.kind] += r.count;
  return Response.json(out);
}
