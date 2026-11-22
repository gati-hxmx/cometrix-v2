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
  // 受け手が読んだ分だけ次のページを読む（pull）。遅い相手でもサーバーに全件をためず、切られたら読むのをやめる。
  // 流し始めた後の失敗（タイムアウトなど）は状態を変えられないので、ファイルが途中で切れる。
  let rows: Awaited<ReturnType<typeof page>> | null = first;
  let headSent = false;
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (!headSent) {
          headSent = true;
          controller.enqueue(enc.encode(csvHead()));
          return;
        }
        if (rows === null) {
          controller.close();
          return;
        }
        const cur = rows;
        if (cur.length > 0) controller.enqueue(enc.encode(cur.map(csvRow).join("")));
        if (cur.length < PAGE) {
          rows = null;
          controller.close();
          return;
        }
        try {
          rows = await page(cur[cur.length - 1]);
        } catch (e) {
          controller.error(e);
        }
      },
      cancel() {
        rows = null;
      },
    },
    { highWaterMark: 1 },
  );
  const title = (job.result as { title?: string } | null)?.title ?? "";
  const name = exportFileName(title, "csv");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="chat.csv"; filename*=UTF-8''${encodeRfc8187(name)}`,
      "cache-control": "no-store",
    },
  });
}

/** RFC 8187 の filename* の値。encodeURIComponent が残す ' ( ) * も符号にする。 */
function encodeRfc8187(s: string) {
  return encodeURIComponent(s).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
