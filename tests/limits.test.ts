import { beforeEach, describe, expect, test, vi } from "vitest";
import { checkRate, clientKey, resetRateLimits } from "../src/lib/limits";
import { parseVideoUrl } from "../src/lib/youtube-url";

const enqueue = vi.fn();
vi.mock("../src/db/client", () => ({ getDb: () => ({}) }));
vi.mock("../src/lib/jobs", () => ({ enqueue: (...a: unknown[]) => enqueue(...a) }));

const post = (ip: string, url = "https://www.youtube.com/watch?v=aaaaaaaaaaa") =>
  new Request("http://x/api/jobs", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });

beforeEach(() => {
  resetRateLimits();
  enqueue.mockReset();
  vi.unstubAllEnvs();
});

describe("許していない URL", () => {
  test.each([
    "http://127.0.0.1/watch?v=aaaaaaaaaaa",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost:3000/",
    "https://example.com/watch?v=aaaaaaaaaaa",
    "https://youtube.com.evil.example/watch?v=aaaaaaaaaaa",
    "https://evil.example/https://www.youtube.com/watch?v=aaaaaaaaaaa",
    "https://youtube.com@evil.example/watch?v=aaaaaaaaaaa",
    "file:///etc/passwd",
    "ftp://www.youtube.com/watch?v=aaaaaaaaaaa",
  ])("%s は受け付けない", (u) => {
    expect(parseVideoUrl(u).ok).toBe(false);
  });

  test("API は 400 を返し、取得を始めない", async () => {
    const { POST } = await import("../src/app/api/jobs/route");
    enqueue.mockResolvedValue({ ok: false, code: "invalid_url" });
    const res = await POST(post("1.1.1.1", "http://127.0.0.1/"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_url");
  });
});

describe("連打の制限", () => {
  test("10回目までは通り、11回目で断る", () => {
    for (let i = 0; i < 10; i++) expect(checkRate("a", 1000 + i).ok).toBe(true);
    const r = checkRate("a", 1010);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  test("接続元ごとに数える", () => {
    for (let i = 0; i < 10; i++) checkRate("a", 1000);
    expect(checkRate("a", 1000).ok).toBe(false);
    expect(checkRate("b", 1000).ok).toBe(true);
  });

  test("時間が過ぎれば再び通る", () => {
    for (let i = 0; i < 10; i++) checkRate("a", 1000);
    expect(checkRate("a", 1000 + 59_000).ok).toBe(false);
    expect(checkRate("a", 1000 + 60_000).ok).toBe(true);
  });

  test("上限は環境変数で変えられる", () => {
    vi.stubEnv("RATE_LIMIT_MAX", "2");
    checkRate("a", 1);
    checkRate("a", 2);
    expect(checkRate("a", 3).ok).toBe(false);
  });

  test("接続元は x-forwarded-for の先頭、なければ x-real-ip", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientKey(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientKey(new Headers())).toBe("unknown");
  });

  test("API は 429 と Retry-After を返す", async () => {
    const { POST } = await import("../src/app/api/jobs/route");
    enqueue.mockResolvedValue({ ok: true, id: "j", created: true });
    for (let i = 0; i < 10; i++) expect((await POST(post("2.2.2.2"))).status).toBe(201);
    const res = await POST(post("2.2.2.2"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).error.message).toContain("混んでいます");
    expect((await POST(post("3.3.3.3"))).status).toBe(201);
  });
});

describe("待ち行列がいっぱいのとき", () => {
  test("API は 503 と Retry-After を返す", async () => {
    const { POST } = await import("../src/app/api/jobs/route");
    enqueue.mockResolvedValue({ ok: false, code: "busy" });
    const res = await POST(post("4.4.4.4"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await res.json()).error.message).toContain("混んでいます");
  });
});
