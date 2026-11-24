import { timingSafeEqual } from "node:crypto";
import {
  cookieHeader,
  exchangeCode,
  FLOW_COOKIE,
  googleConfig,
  readCookie,
  safeNext,
} from "../../../../auth/google";
import { createSession, SESSION_COOKIE, SESSION_DAYS, upsertUser } from "../../../../auth/session";
import { getDb } from "../../../../db/client";
import { requestOrigin } from "../../../../lib/origin";

export const dynamic = "force-dynamic";

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google から戻ってきたところ（#7）。state を確かめ、コードを交換し、ログインの鍵を渡す */
export async function GET(req: Request) {
  const origin = requestOrigin(req.headers);
  const clearFlow = cookieHeader(FLOW_COOKIE, "", { path: "/api/auth", maxAgeSec: 0, origin });
  const fail = () => {
    const headers = new Headers({ location: `${origin}/login?error=failed` });
    headers.append("set-cookie", clearFlow);
    return new Response(null, { status: 303, headers });
  };

  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const config = googleConfig(origin);
  let flow: { state?: unknown; verifier?: unknown; next?: unknown } | null = null;
  try {
    const raw = readCookie(req.headers.get("cookie"), FLOW_COOKIE);
    flow = raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : null;
  } catch {
    flow = null;
  }
  if (
    !config ||
    params.has("error") ||
    !code ||
    !state ||
    !flow ||
    typeof flow.state !== "string" ||
    typeof flow.verifier !== "string" ||
    !sameText(flow.state, state)
  )
    return fail();

  const profile = await exchangeCode(config, code, flow.verifier);
  if (!profile) return fail();
  let token: string;
  try {
    const db = getDb();
    const userId = await upsertUser(db, profile);
    token = (await createSession(db, userId)).token;
  } catch {
    // DB に届かないときもログインせずに /login へ戻す
    return fail();
  }

  const next = safeNext(typeof flow.next === "string" ? flow.next : null);
  const headers = new Headers({ location: `${origin}${next}` });
  headers.append("set-cookie", clearFlow);
  headers.append(
    "set-cookie",
    cookieHeader(SESSION_COOKIE, token, { path: "/", maxAgeSec: SESSION_DAYS * 86400, origin }),
  );
  return new Response(null, { status: 303, headers });
}
