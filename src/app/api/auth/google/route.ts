import {
  authUrl,
  cookieHeader,
  FLOW_COOKIE,
  googleConfig,
  LOGIN_FLOW_SEC,
  randomToken,
  safeNext,
} from "../../../../auth/google";
import { requestOrigin } from "../../../../lib/origin";

export const dynamic = "force-dynamic";

/** ［Google でログイン］：state と PKCE の鍵を Cookie に置き、Google の画面へ移る（#7） */
export async function GET(req: Request) {
  const origin = requestOrigin(req.headers);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const config = googleConfig(origin);
  if (!config) return Response.redirect(`${origin}/login?error=unconfigured`, 303);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const value = Buffer.from(JSON.stringify({ state, verifier, next })).toString("base64url");
  const headers = new Headers({ location: authUrl(config, state, verifier) });
  headers.append(
    "set-cookie",
    cookieHeader(FLOW_COOKIE, value, { path: "/api/auth", maxAgeSec: LOGIN_FLOW_SEC, origin }),
  );
  return new Response(null, { status: 303, headers });
}
