import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { jobs } from "../../../../db/schema";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  const [job] = await getDb()
    .select({
      id: jobs.id,
      status: jobs.status,
      videoId: jobs.videoId,
      result: jobs.result,
      error: jobs.error,
    })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!job) return Response.json({ error: { code: "not_found" } }, { status: 404 });
  return Response.json(job);
}
