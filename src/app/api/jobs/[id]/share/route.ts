import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { jobs } from "../../../../../db/schema";
import { newShareToken, SHARE_TOKEN } from "../../../../../lib/share-link";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 共有リンクを作る（#68）。すでにあればその鍵を返す。分析が終わっていなければ 409。
 * 本文に { token } があれば、その鍵で作り直す（「共有をやめる」の［元に戻す］で同じリンクに戻すため）。
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  let wanted: string | null = null;
  const text = await req.text();
  if (text) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
    }
    const t = (body as { token?: unknown } | null)?.token;
    if (t !== undefined && (typeof t !== "string" || !SHARE_TOKEN.test(t)))
      return Response.json({ error: { code: "bad_request" } }, { status: 400 });
    wanted = (t as string | undefined) ?? null;
  }
  const db = getDb();
  const [job] = await db
    .select({ status: jobs.status, shareToken: jobs.shareToken })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });
  if (job.shareToken) return Response.json({ token: job.shareToken });
  const token = wanted ?? newShareToken();
  try {
    // 同時に2回押されても鍵は1つ：まだ鍵が無いときだけ入れ、入らなければ先に入った鍵を返す
    const [row] = await db
      .update(jobs)
      .set({ shareToken: token })
      .where(and(eq(jobs.id, id), isNull(jobs.shareToken)))
      .returning({ token: jobs.shareToken });
    if (row) return Response.json({ token: row.token }, { status: 201 });
    const [now] = await db
      .select({ shareToken: jobs.shareToken })
      .from(jobs)
      .where(eq(jobs.id, id));
    return Response.json({ token: now?.shareToken ?? null });
  } catch {
    // 元に戻す鍵がほかで使われていた（ほぼ起きない）
    return Response.json({ error: { code: "conflict" } }, { status: 409 });
  }
}

/** 共有をやめる。リンクは開けなくなる。やめた鍵を返す（［元に戻す］用）。 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const db = getDb();
  const [job] = await db.select({ shareToken: jobs.shareToken }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  await db.update(jobs).set({ shareToken: null }).where(eq(jobs.id, id));
  return Response.json({ token: job.shareToken });
}
