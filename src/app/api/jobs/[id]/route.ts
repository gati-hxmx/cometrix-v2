import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { jobs } from "../../../../db/schema";
import { retryAfterSec } from "../../../../lib/jobs";
import { readProgress } from "../../../../lib/progress";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const [job] = await getDb()
    .select({
      id: jobs.id,
      status: jobs.status,
      platform: jobs.platform,
      videoId: jobs.videoId,
      result: jobs.result,
      error: jobs.error,
      // 共有リンクの鍵（#68）。この画面の ⋮ メニューで使う
      shareToken: jobs.shareToken,
      sharedAt: jobs.sharedAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  // 取得中は result に進み具合だけが入っている（#43）。結果は done のときだけ返す。
  const done = job.status === "done";
  const { updatedAt, sharedAt, shareToken, ...rest } = job;
  return Response.json({
    ...rest,
    result: done ? job.result : null,
    // done／failed のとき、あと何秒で分析し直せるか（#99）。
    retryAfterSec: done || job.status === "failed" ? retryAfterSec(updatedAt) : null,
    progress: job.status === "running" ? readProgress(job.result) : null,
    // 共有しているときだけ鍵を返す（#68）
    shareToken: sharedAt ? shareToken : null,
  });
}
