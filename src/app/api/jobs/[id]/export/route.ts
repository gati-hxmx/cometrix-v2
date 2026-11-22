import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { chatMessages, jobs } from "../../../../../db/schema";
import { parseFilter } from "../../../../../lib/chat-filter";
import { FILTER_TIMEOUT_MS, filterConds, isBadPatternError } from "../../../../../lib/chat-sql";
import { csvHead, csvRow, exportFileName } from "../../../../../lib/export";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 5000;

/**
 * チャットを CSV で返す（#59）。q・user などの絞り込みはチャット一覧と同じ。時刻順・動画開始前は除く。
 * 件数が多くても一度に読み込まないよう、5,000件ずつ読んで流す。
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const f = parseFilter(new URL(req.url).searchParams);
  if (!f.ok) return Response.json({ error: { code: "bad_request" } }, { status: 400 });
  const db = getDb();
  const [job] = await db
    .select({ status: jobs.status, result: jobs.result })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });

  const base: SQL[] = [
    eq(chatMessages.jobId, id),
    sql`${chatMessages.offsetMs} >= 0`,
    ...filterConds(f.filter),
  ];
  const page = (after: { offsetMs: number; id: number } | null) =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('statement_timeout', ${String(FILTER_TIMEOUT_MS)}, true)`,
      );
      return tx
        .select({
          id: chatMessages.id,
          offsetMs: chatMessages.offsetMs,
          author: chatMessages.author,
          body: chatMessages.body,
        })
        .from(chatMessages)
        .where(
          and(
            ...base,
            after
              ? sql`(${chatMessages.offsetMs}, ${chatMessages.id}) > (${after.offsetMs}, ${after.id})`
              : undefined,
          ),
        )
        .orderBy(asc(chatMessages.offsetMs), asc(chatMessages.id))
        .limit(PAGE);
    });

  // 最初のページは先に読み、正規表現の誤りなどは 400 で返す（流し始めた後は状態を変えられない）。
  let first: Awaited<ReturnType<typeof page>>;
  try {
    first = await page(null);
  } catch (e) {
    if (isBadPatternError(e))
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
    throw e;
  }
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(enc.encode(csvHead()));
        let rows = first;
        while (rows.length > 0) {
          controller.enqueue(enc.encode(rows.map(csvRow).join("")));
          if (rows.length < PAGE) break;
          rows = await page(rows[rows.length - 1]);
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  const title = (job.result as { title?: string } | null)?.title ?? "";
  const name = exportFileName(title, "csv");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="chat.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
