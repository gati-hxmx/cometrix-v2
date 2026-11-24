import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import * as schema from "../src/db/schema";
import { jobs, sessions, userJobs, users } from "../src/db/schema";

// Google ログイン（#7）：利用者・ログインの鍵・分析の紐づけ、戻ってきたところの流れ。
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("ログイン（Postgres、#7）", () => {
  const sql = postgres(url ?? "postgres://invalid", { max: 3 });
  const db = drizzle(sql, { schema });
  let s: typeof import("../src/auth/session");
  let callback: typeof import("../src/app/api/auth/callback/route");
  let start: typeof import("../src/app/api/auth/google/route");
  let logout: typeof import("../src/app/api/auth/logout/route");
  let jobsRoute: typeof import("../src/app/api/jobs/route");
  const CID = "cid.apps.googleusercontent.com";
  const profile = { sub: "g-1", email: "a@example.com", name: "あおい", picture: null };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.APP_ORIGIN = "http://localhost:3000";
    process.env.GOOGLE_CLIENT_ID = CID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    await migrate(db, { migrationsFolder: "./drizzle" });
    s = await import("../src/auth/session");
    callback = await import("../src/app/api/auth/callback/route");
    start = await import("../src/app/api/auth/google/route");
    logout = await import("../src/app/api/auth/logout/route");
    jobsRoute = await import("../src/app/api/jobs/route");
  });
  beforeEach(async () => {
    await db.delete(users);
    await db.delete(jobs);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.APP_ORIGIN;
    await sql.end();
  });

  test("同じ Google の利用者は1人。2回目は名前とログインの時刻を新しくする", async () => {
    const a = await s.upsertUser(db, profile);
    const b = await s.upsertUser(db, { ...profile, name: "あおい2" });
    expect(b).toBe(a);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("あおい2");
  });

  test("鍵は DB にハッシュだけ。期限切れ・消した鍵では読めない", async () => {
    const uid = await s.upsertUser(db, profile);
    const { token } = await s.createSession(db, uid);
    const [row] = await db.select().from(sessions);
    expect(row.id).not.toBe(token);
    expect(row.id).toBe(s.hashToken(token));
    expect((await s.readSession(db, token))?.email).toBe("a@example.com");
    expect(await s.readSession(db, `${token}x`)).toBeNull();
    const later = new Date(Date.now() + 31 * 86400_000);
    expect(await s.readSession(db, token, later)).toBeNull();
    await s.deleteSession(db, token);
    expect(await s.readSession(db, token)).toBeNull();
  });

  async function begin(next = "/me") {
    const res = await start.GET(new Request(`http://localhost:3000/api/auth/google?next=${next}`));
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location") ?? "");
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    return { state: loc.searchParams.get("state") ?? "", cookie };
  }
  function idToken(claims: Record<string, unknown>) {
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b({ alg: "RS256" })}.${b(claims)}.sig`;
  }
  function fakeGoogle() {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id_token: idToken({
                iss: "https://accounts.google.com",
                aud: CID,
                exp: Math.floor(Date.now() / 1000) + 600,
                sub: "g-1",
                email: "a@example.com",
                email_verified: true,
                name: "あおい",
              }),
            }),
          ),
      ),
    );
  }

  test("Google から戻ると、利用者を作ってログインの鍵を渡し、前の画面に戻る", async () => {
    const { state, cookie } = await begin("/me");
    fakeGoogle();
    const res = await callback.GET(
      new Request(`http://localhost:3000/api/auth/callback?code=c&state=${state}`, {
        headers: { cookie },
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/me");
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(
      /cx_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax/,
    );
    expect(setCookie).toContain("cx_oauth=; Path=/api/auth; Max-Age=0");
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  test("state が合わない・Cookie がない・Google がエラーなら、ログインせずにログインの画面へ", async () => {
    const { cookie } = await begin();
    fakeGoogle();
    for (const req of [
      new Request("http://localhost:3000/api/auth/callback?code=c&state=wrong", {
        headers: { cookie },
      }),
      new Request("http://localhost:3000/api/auth/callback?code=c&state=x"),
      new Request("http://localhost:3000/api/auth/callback?error=access_denied&state=x", {
        headers: { cookie },
      }),
    ]) {
      const res = await callback.GET(req);
      expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=failed");
      expect(res.headers.getSetCookie().join("\n")).not.toContain("cx_session=");
    }
    expect(await db.select().from(users)).toHaveLength(0);
  });

  test("よそのサイトへの戻る先は / にする", async () => {
    const { state, cookie } = await begin(encodeURIComponent("//evil.example"));
    fakeGoogle();
    const res = await callback.GET(
      new Request(`http://localhost:3000/api/auth/callback?code=c&state=${state}`, {
        headers: { cookie },
      }),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  test("ログアウトは自分のサイトからの POST だけ。鍵を消して Cookie を空にする", async () => {
    const uid = await s.upsertUser(db, profile);
    const { token } = await s.createSession(db, uid);
    const req = (origin: string) =>
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { origin, cookie: `cx_session=${token}` },
      });
    expect((await logout.POST(req("https://evil.example"))).status).toBe(403);
    const noOrigin = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { cookie: `cx_session=${token}` },
    });
    expect((await logout.POST(noOrigin)).status).toBe(403);
    expect(await s.readSession(db, token)).not.toBeNull();
    const res = await logout.POST(req("http://localhost:3000"));
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("cx_session=; Path=/; Max-Age=0");
    expect(await s.readSession(db, token)).toBeNull();
  });

  test("ログインして分析を始めると自分に紐づく。同じ動画はほかの人にも紐づき、分析は1つ", async () => {
    const a = await s.upsertUser(db, profile);
    const b = await s.upsertUser(db, { ...profile, sub: "g-2", email: "b@example.com" });
    const ta = (await s.createSession(db, a)).token;
    const tb = (await s.createSession(db, b)).token;
    const post = (token?: string) =>
      jobsRoute.POST(
        new Request("http://localhost:3000/api/jobs", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}`,
            ...(token ? { cookie: `cx_session=${token}` } : {}),
          },
          body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abcdefghijk" }),
        }),
      );
    const r1 = (await (await post(ta)).json()) as { id: string };
    const r2 = (await (await post(tb)).json()) as { id: string };
    const r3 = (await (await post()).json()) as { id: string };
    expect(r2.id).toBe(r1.id);
    expect(r3.id).toBe(r1.id);
    expect(await db.select().from(jobs)).toHaveLength(1);
    const links = await db.select().from(userJobs).where(eq(userJobs.jobId, r1.id));
    expect(links.map((l) => l.userId).sort()).toEqual([a, b].sort());
    // 同じ人がもう一度始めても紐づけは1つ
    await post(ta);
    expect(await db.select().from(userJobs)).toHaveLength(2);
  });
});
