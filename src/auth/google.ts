import { createHash, randomBytes } from "node:crypto";

/**
 * Google でログイン（#7、docs/specs/7-google-login.md）。OpenID Connect の認可コード＋PKCE＋state。
 * 外のライブラリは使わず、Google の窓口に直接 HTTPS で話す。
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** Google の画面に行って戻るまでの待ち時間（state と PKCE の Cookie の期限） */
export const LOGIN_FLOW_SEC = 600;
/** state・PKCE の鍵・戻る先を入れる Cookie（/api/auth の中だけで使う） */
export const FLOW_COOKIE = "cx_oauth";

/** Set-Cookie の値。HttpOnly・SameSite=Lax、https なら Secure */
export function cookieHeader(
  name: string,
  value: string,
  o: { path: string; maxAgeSec: number; origin: string },
): string {
  const secure = o.origin.startsWith("https://") ? "; Secure" : "";
  return `${name}=${value}; Path=${o.path}; Max-Age=${o.maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

/** Cookie の見出しから1つ読む */
export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** 環境変数から設定を読む。どちらかがなければ null（ログインは準備中） */
export function googleConfig(
  origin: string,
  env: Record<string, string | undefined> = process.env,
): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${origin}/api/auth/callback` };
}

export function isLoginConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

/** URL に安全なランダムな文字列 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE の S256（RFC 7636） */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authUrl(c: GoogleConfig, state: string, verifier: string): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", pkceChallenge(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export type GoogleProfile = { sub: string; email: string; name: string; picture: string | null };

/**
 * Google のトークンの窓口から受け取った ID トークンの中身を読み、確かめる。
 * TLS で直接受け取ったものなので署名の確かめは省く（OpenID Connect Core 3.1.3.7 の 6）。
 * 発行元・宛先・期限・メールの確認済みが合わなければ null。
 */
export function readIdToken(idToken: string, clientId: string, nowSec = Date.now() / 1000) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const aud = claims.aud;
  const audOk = aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  if (!ISSUERS.includes(String(claims.iss)) || !audOk) return null;
  if (typeof claims.exp !== "number" || claims.exp < nowSec) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.email !== "string" || !claims.email) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  const profile: GoogleProfile = {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === "string" ? claims.name : "",
    picture: typeof claims.picture === "string" ? claims.picture : null,
  };
  return profile;
}

/** 認可コードを ID トークンに交換し、利用者の情報を返す。失敗は null */
export async function exchangeCode(
  c: GoogleConfig,
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleProfile | null> {
  try {
    const res = await fetcher(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: c.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id_token?: unknown };
    if (typeof body.id_token !== "string") return null;
    return readIdToken(body.id_token, c.clientId);
  } catch {
    return null;
  }
}

/** ログインのあとに戻る先。自分のサイトの中のパスだけ（よそのサイトへ飛ばさない） */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  // 制御文字（改行など）を含むものは使わない
  for (const ch of next) if (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f) return "/";
  // 念のため URL として読み、自分のサイトの中に留まるかを確かめる
  const base = "http://cometrix.invalid";
  const u = new URL(next, base);
  if (u.origin !== base) return "/";
  // "/.//evil" などは読んだあとに "//evil" になるので、読んだ結果もう一度確かめる
  const path = `${u.pathname}${u.search}${u.hash}`;
  return path.startsWith("//") || path.startsWith("/\\") ? "/" : path;
}
