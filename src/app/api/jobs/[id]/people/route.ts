import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { jobs } from "../../../../../db/schema";
import { FILTER_TIMEOUT_MS } from "../../../../../lib/chat-sql";
import { peopleSummary, TOP_PEOPLE } from "../../../../../lib/people";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 常連と初見（#64）。この配信でコメントが多い人の上位と、コメントした人の数。
 * 同じチャンネルの前の配信（分析済み）があれば、そのどれにもコメントしていなかった人の数（初見）も返す。
 * チャンネル・配信の時刻が分からない分析や、前の配信の分析がないときは firstTimers は null。
 * 名前を出すので、公開の共有リンク（C7）からは呼ばない。
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const db = getDb();
  const [job] = await db
    .select({ status: jobs.status, result: jobs.result })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });
  const r = (job.result ?? {}) as { channelId?: unknown; streamedAt?: unknown };
  const channel = typeof r.channelId === "string" ? r.channelId : null;
  const at = typeof r.streamedAt === "number" ? r.streamedAt : null;

  const out = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('statement_timeout', ${String(FILTER_TIMEOUT_MS)}, true)`,
    );
    const top = await tx.execute(
      sql`select author, count(*)::int as count from chat_messages where job_id = ${id}
          group by author order by count desc, author limit ${TOP_PEOPLE}`,
    );
    const [all] = await tx.execute(
      sql`select count(distinct author)::int as n from chat_messages where job_id = ${id}`,
    );
    let first: { count: number; pastJobs: number } | null = null;
    if (channel !== null && at !== null) {
      const [row] = await tx.execute(sql`
        with past as (
          select id from jobs
          where status = 'done' and id <> ${id}
            and result->>'channelId' = ${channel}
            and (result->>'streamedAt') ~ '^[0-9]+$'
            and (result->>'streamedAt')::bigint < ${at}
        )
        select (select count(*)::int from past) as "pastJobs",
               (select count(*)::int from (
                  select author from chat_messages where job_id = ${id}
                  except
                  select author from chat_messages where job_id in (select id from past)
               ) t) as "count"`);
      if (row && Number(row.pastJobs) > 0)
        first = { count: Number(row.count), pastJobs: Number(row.pastJobs) };
    }
    return peopleSummary(
      Array.from(top, (t) => ({ author: String(t.author), count: Number(t.count) })),
      Number(all?.n ?? 0),
      first,
    );
  });
  return Response.json(out);
}
