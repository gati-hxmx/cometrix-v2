import { getDb } from "../../../db/client";
import { enqueue } from "../../../lib/jobs";
import { BUSY_MESSAGE, checkRate, clientKey } from "../../../lib/limits";
import { FAILURE_MESSAGES } from "../../../worker/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rate = checkRate(clientKey(req.headers));
  if (!rate.ok) {
    return Response.json(
      { error: { code: "rate_limited", message: BUSY_MESSAGE } },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const res = await enqueue(getDb(), url);
  if (!res.ok && res.code === "busy") {
    return Response.json(
      { error: { code: "busy", message: BUSY_MESSAGE } },
      { status: 503, headers: { "retry-after": "30" } },
    );
  }
  if (!res.ok) {
    return Response.json(
      { error: { code: res.code, message: FAILURE_MESSAGES.invalid_url } },
      { status: 400 },
    );
  }
  return Response.json({ id: res.id }, { status: res.created ? 201 : 200 });
}
