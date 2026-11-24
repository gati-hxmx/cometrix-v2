import { readCookie } from "../../../auth/google";
import { linkJob, readSession, SESSION_COOKIE } from "../../../auth/session";
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
  // ログインしていれば、その分析を自分に紐づける（#7）。紐づけに失敗しても分析は続ける
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    try {
      const user = await readSession(getDb(), token);
      if (user) await linkJob(getDb(), user.id, res.id);
    } catch {}
  }
  return Response.json({ id: res.id }, { status: res.created ? 201 : 200 });
}
