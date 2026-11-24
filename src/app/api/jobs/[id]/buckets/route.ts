import { asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatBuckets, chatMessages, jobs } from "../../../../../db/schema";
import type { Bucket } from "../../../../../lib/buckets";
import { fillBuckets, isFiltering, parseFilter } from "../../../../../lib/chat-filter";
import {
  FILTER_TIMEOUT_MS,
  filterConds,
  isBadPatternError,
  laughCond,
  spamFreeSource,
  termCond,
} from "../../../../../lib/chat-sql";
import { normalizeKeyword } from "../../../../../lib/term";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 30秒ごとのコメント数。分析が終わっていない（done 以外）ときは 409。
 * q・user があるときは、一致したコメントだけを同じ区間で数える。
 * laugh=1 のときは、笑いのコメント（lib/laugh.ts）だけを数える。絞り込みと同時に使える。
 * spam=1 のときは、スパム（lib/spam.ts：連投・長いコピペ）を除いて数える。判定は絞り込みの前の全コメントで行う。
 * term=言葉 のときは、その言葉を含むコメントだけを数える（#53）。ほかの絞り込み・laugh とは同時に使えない。
 * users=1 のときは、コメントの数ではなく、区間ごとにコメントした人の数を数える（同じ人の連投は1人。#55）。
 * 絞り込み・laugh・spam と同時に使える。
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const params = new URL(req.url).searchParams;
  const f = parseFilter(params);
  const laughParam = params.get("laugh");
  if (laughParam !== null && laughParam !== "1" && laughParam !== "0")
    return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const laugh = laughParam === "1";
  const terms = params.getAll("term");
  let term: string | null = null;
  if (terms.length > 0) {
    term = terms.length === 1 ? normalizeKeyword(terms[0]) : null;
    const others = ["q", "xq", "user", "xuser", "re", "xre", "laugh", "spam"].some((k) =>
      params.has(k),
    );
    if (term === null || others)
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  }
  const spamParam = params.get("spam");
  if (spamParam !== null && spamParam !== "1" && spamParam !== "0")
    return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const spam = spamParam === "1";
  const usersParam = params.get("users");
  if (usersParam !== null && usersParam !== "1" && usersParam !== "0")
    return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const users = usersParam === "1";
  if (users && term !== null)
    return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  if (!f.ok) return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });

  if (!isFiltering(f.filter) && !laugh && !spam && !users && term === null) {
    const rows = await db
      .select({ startSec: chatBuckets.startSec, count: chatBuckets.count })
      .from(chatBuckets)
      .where(eq(chatBuckets.jobId, id))
      .orderBy(asc(chatBuckets.startSec));
    return Response.json(rows);
  }

  const conds: SQL[] = [...filterConds(f.filter)];
  if (laugh) conds.push(laughCond());
  if (term !== null) conds.push(termCond(term));
  if (!spam) conds.push(sql`${chatMessages.jobId} = ${id}`, sql`${chatMessages.offsetMs} >= 0`);
  const start = sql`(floor(${chatMessages.offsetMs} / 30000) * 30)::int`;
  const measure = users ? sql`count(distinct ${chatMessages.author})::int` : sql`count(*)::int`;
  const from = spam ? spamFreeSource(id) : sql`${chatMessages}`;
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  let found: Bucket[];
  try {
    found = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('statement_timeout', ${String(FILTER_TIMEOUT_MS)}, true)`,
      );
      const rows = await tx.execute(
        sql`select ${start} as "startSec", ${measure} as "count" from ${from} ${where} group by 1`,
      );
      return Array.from(rows, (r) => ({ startSec: Number(r.startSec), count: Number(r.count) }));
    });
  } catch (e) {
    if (isBadPatternError(e))
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
    throw e;
  }
  // 棒の位置がずれないよう、絞り込まない集計と同じ長さにそろえる。
  const [last] = await db
    .select({ startSec: chatBuckets.startSec })
    .from(chatBuckets)
    .where(eq(chatBuckets.jobId, id))
    .orderBy(desc(chatBuckets.startSec))
    .limit(1);
  return Response.json(fillBuckets(found, last?.startSec ?? 0));
}
