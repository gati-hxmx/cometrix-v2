import { describe, expect, it } from "vitest";
import {
  authUrl,
  cookieHeader,
  exchangeCode,
  googleConfig,
  isLoginConfigured,
  pkceChallenge,
  readCookie,
  readIdToken,
  safeNext,
} from "../src/auth/google";

const CID = "client-123.apps.googleusercontent.com";
const conf = {
  clientId: CID,
  clientSecret: "s",
  redirectUri: "https://x.example/api/auth/callback",
};
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const good = {
  iss: "https://accounts.google.com",
  aud: CID,
  exp: 2_000_000_000,
  sub: "1234567890",
  email: "a@example.com",
  email_verified: true,
  name: "あおい",
  picture: "https://lh3.googleusercontent.com/a",
};

describe("設定（#7）", () => {
  it("ID と秘密の両方がそろったときだけ使える", () => {
    expect(googleConfig("https://x.example", {})).toBeNull();
    expect(googleConfig("https://x.example", { GOOGLE_CLIENT_ID: CID })).toBeNull();
    expect(
      googleConfig("https://x.example", { GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: "s" }),
    ).toEqual(conf);
    expect(isLoginConfigured({ GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "s" })).toBe(false);
  });
});

describe("Google の画面へのリンク", () => {
  it("認可コード・PKCE（S256）・state・openid email profile", () => {
    const u = new URL(authUrl(conf, "st", "ver"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe(CID);
    expect(u.searchParams.get("redirect_uri")).toBe(conf.redirectUri);
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge("ver"));
  });
  it("PKCE は SHA-256 を base64url（= なし）にしたもの", async () => {
    const v = "dBjftJeZ4CVP-mJ92K9qnyHiFPgmKrbN1aRb1Y0bfI0";
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    expect(pkceChallenge(v)).toBe(Buffer.from(d).toString("base64url"));
    expect(pkceChallenge(v)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("ID トークンを確かめる", () => {
  it("正しいものは利用者の情報を返す", () => {
    expect(readIdToken(token(good), CID, 1_900_000_000)).toEqual({
      sub: "1234567890",
      email: "a@example.com",
      name: "あおい",
      picture: "https://lh3.googleusercontent.com/a",
    });
  });
  it("発行元・宛先・期限・メールの確認・形がちがうものは使わない", () => {
    const now = 1_900_000_000;
    expect(readIdToken(token({ ...good, iss: "https://evil.example" }), CID, now)).toBeNull();
    expect(readIdToken(token({ ...good, aud: "other" }), CID, now)).toBeNull();
    expect(readIdToken(token({ ...good, exp: now - 1 }), CID, now)).toBeNull();
    expect(readIdToken(token({ ...good, email_verified: false }), CID, now)).toBeNull();
    expect(readIdToken(token({ ...good, sub: "" }), CID, now)).toBeNull();
    expect(readIdToken("abc", CID, now)).toBeNull();
    expect(readIdToken("a.%%%.c", CID, now)).toBeNull();
  });
});

describe("コードの交換", () => {
  it("トークンの窓口に PKCE の鍵つきで送り、ID トークンを読む", async () => {
    const box: { sent?: URLSearchParams } = {};
    const fake = (async (_url: string, init: RequestInit) => {
      box.sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id_token: token({ ...good, exp: 9_999_999_999 }) }));
    }) as unknown as typeof fetch;
    const p = await exchangeCode(conf, "code1", "ver1", fake);
    expect(p?.sub).toBe("1234567890");
    expect(box.sent?.get("code_verifier")).toBe("ver1");
    expect(box.sent?.get("grant_type")).toBe("authorization_code");
  });
  it("窓口がエラー・通信の失敗は null", async () => {
    const bad = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    expect(await exchangeCode(conf, "c", "v", bad)).toBeNull();
    const down = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await exchangeCode(conf, "c", "v", down)).toBeNull();
  });
});

describe("戻る先", () => {
  it("自分のサイトの中のパスだけ", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/analysis/abc?x=1#t")).toBe("/analysis/abc?x=1#t");
    for (const bad of [
      null,
      "",
      "me",
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "/\nSet-Cookie:x",
      "javascript:alert(1)",
      // 読んだあとに "//" で始まるもの（. や .. がたたまれる）
      "/.//evil.example",
      "/..//evil.example",
      "/%2e//evil.example",
      "/a/..//evil.example",
    ])
      expect(safeNext(bad)).toBe("/");
  });
});

describe("Cookie", () => {
  it("HttpOnly・SameSite=Lax。https のときだけ Secure", () => {
    expect(cookieHeader("a", "b", { path: "/", maxAgeSec: 60, origin: "https://x" })).toBe(
      "a=b; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure",
    );
    expect(
      cookieHeader("a", "b", { path: "/", maxAgeSec: 60, origin: "http://localhost" }),
    ).not.toContain("Secure");
  });
  it("見出しから1つ読む", () => {
    expect(readCookie("x=1; cx_session=abc=; y=2", "cx_session")).toBe("abc=");
    expect(readCookie(null, "cx_session")).toBeUndefined();
  });
});
