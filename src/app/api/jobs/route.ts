import { getDb } from "../../../db/client";
import { enqueue } from "../../../lib/jobs";
import { FAILURE_MESSAGES } from "../../../worker/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const res = await enqueue(getDb(), url);
  if (!res.ok) {
    const message =
      res.code === "unsupported_url"
        ? "Twitch にはまだ対応していません。"
        : FAILURE_MESSAGES.invalid_url;
    return Response.json({ error: { code: res.code, message } }, { status: 400 });
  }
  return Response.json({ id: res.id }, { status: res.created ? 201 : 200 });
}
