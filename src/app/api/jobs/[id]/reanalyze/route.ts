import { getDb } from "../../../../../db/client";
import { reanalyze } from "../../../../../lib/jobs";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES = {
  not_found: "分析が見つかりません。",
  busy: "取得中です。終わってから、もう一度お試しください。",
  too_soon: "続けて分析し直せません。少し待ってからお試しください。",
  duplicate: "同じ動画の新しい分析があります。",
} as const;

/** 分析のコメント・集計を消して、同じ URL で取り直す（#99）。 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    const error = { code: "not_found", message: MESSAGES.not_found };
    return Response.json({ error }, { status: 404 });
  }
  const res = await reanalyze(getDb(), id);
  if (res.ok) return Response.json({ id: res.id }, { status: 202 });
  const error = { code: res.code, message: MESSAGES[res.code] };
  if (res.code === "not_found") return Response.json({ error }, { status: 404 });
  if (res.code === "too_soon")
    return Response.json(
      { error: { ...error, retryAfterSec: res.retryAfterSec } },
      { status: 429 },
    );
  if (res.code === "duplicate") return Response.json({ error, id: res.id }, { status: 409 });
  return Response.json({ error }, { status: 409 });
}
