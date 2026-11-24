import { cookieHeader, readCookie } from "../../../../auth/google";
import { deleteSession, SESSION_COOKIE } from "../../../../auth/session";
import { getDb } from "../../../../db/client";
import { requestOrigin } from "../../../../lib/origin";

export const dynamic = "force-dynamic";

/** ログアウト（#7）。POST だけ。よそのサイトからの送信（Origin が違う）は断る */
export async function POST(req: Request) {
  const origin = requestOrigin(req.headers);
  if (req.headers.get("origin") !== origin)
    return Response.json({ error: { code: "forbidden" } }, { status: 403 });
  try {
    await deleteSession(getDb(), readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  } catch {
    // DB に届かなくても、この端末の Cookie は消してログアウトさせる
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: `${origin}/`,
      "set-cookie": cookieHeader(SESSION_COOKIE, "", { path: "/", maxAgeSec: 0, origin }),
    },
  });
}
