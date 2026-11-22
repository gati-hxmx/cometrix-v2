import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { makeYtDlpFetcher } from "../src/worker/fetch-chat";

// yt-dlp の打ち切りは「進まなくなったとき」だけ（#46）。
const bin = fileURLToPath(new URL("./fixtures/fake-yt-dlp.sh", import.meta.url));
const fetcher = makeYtDlpFetcher({ bin, stallMs: 400, pollMs: 50, hardLimitMs: 20_000 });
const URL_ = "https://www.youtube.com/watch?v=aaaaaaaaaaa";

describe("yt-dlp の打ち切り", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("書き続けている取得は、止まったとみなす時間より長くかかっても打ち切らない", async () => {
    vi.stubEnv("FAKE_YT_DLP", "slow");
    const got = await fetcher("aaaaaaaaaaa", URL_, "youtube");
    expect(got.title).toBe("テスト配信");
    expect(got.messages).toHaveLength(12);
  });

  test("何も増えなくなった取得は打ち切り、再試行できる失敗にする", async () => {
    vi.stubEnv("FAKE_YT_DLP", "stall");
    const started = Date.now();
    const e = await fetcher("aaaaaaaaaaa", URL_, "youtube").catch((x) => x);
    expect(e).toMatchObject({ code: "fetch_failed", retryable: true });
    expect(String(e.message)).toContain("進まなかった");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test("理由の分からない失敗は再試行でき、まだ始まっていない配信の枠は再試行しない", async () => {
    vi.stubEnv("FAKE_YT_DLP", "flaky");
    expect(await fetcher("aaaaaaaaaaa", URL_, "youtube").catch((x) => x)).toMatchObject({
      code: "fetch_failed",
      retryable: true,
    });
    vi.stubEnv("FAKE_YT_DLP", "later");
    expect(await fetcher("aaaaaaaaaaa", URL_, "youtube").catch((x) => x)).toMatchObject({
      code: "fetch_failed",
      retryable: false,
    });
  });
});
