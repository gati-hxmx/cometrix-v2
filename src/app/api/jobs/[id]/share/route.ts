import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { jobs } from "../../../../../db/schema";
import { newShareToken } from "../../../../../lib/share-link";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 共有リンクを作る・再開する（#68）。鍵はこの分析で一度だけ作り、やめても残す。
 * もう一度押す（［元に戻す］を含む）と、同じ鍵で共有を再開する。鍵は外から受け取らない。
 * 分析が終わっていなければ 409。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const db = getDb();
  const [job] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  if (job.status !== "done")
    return Response.json({ error: { code: "not_ready" } }, { status: 409 });
  // 鍵がまだ無いときだけ作る。同時に2回押されても、先に入った鍵が残る
  await db
    .update(jobs)
    .set({ shareToken: newShareToken() })
    .where(and(eq(jobs.id, id), isNull(jobs.shareToken)));
  const [row] = await db
    .update(jobs)
    .set({ sharedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning({ token: jobs.shareToken });
  return Response.json({ token: row.token });
}

/** 共有をやめる。リンクは開けなくなる（鍵は残すので、再開すると同じリンクに戻る）。 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const [row] = await getDb()
    .update(jobs)
    .set({ sharedAt: null })
    .where(eq(jobs.id, id))
    .returning({ id: jobs.id });
  if (!row) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return new Response(null, { status: 204 });
}
