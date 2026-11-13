import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { bucketize } from "../src/lib/buckets";
import { twitchTimeParam } from "../src/lib/twitch-time";
import { parseVideoUrl } from "../src/lib/youtube-url";
import { JobFailure } from "../src/worker/errors";
import { fetchTwitchComments, fetchTwitchTitle } from "../src/worker/twitch-chat";

const pages = JSON.parse(
  readFileSync(new URL("./fixtures/twitch_comments.sample.json", import.meta.url), "utf8"),
) as unknown[];

/** 保存済みのページを順に返す fetch。送られた本文も控える。 */
function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const sent: { url: string; body: string }[] = [];
  let i = 0;
  const f = (async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: String(init?.body ?? "") });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, sent };
}

describe("Twitch の URL", () => {
  test("VOD の URL から ID を取り出して正規化する", () => {
    const want = {
      ok: true,
      platform: "twitch",
      videoId: "2345678901",
      url: "https://www.twitch.tv/videos/2345678901",
    };
    for (const u of [
      "https://www.twitch.tv/videos/2345678901?t=1h2m3s",
      "https://twitch.tv/videos/2345678901",
      "https://m.twitch.tv/videos/2345678901/",
    ])
      expect(parseVideoUrl(u)).toEqual(want);
  });

  test("VOD 以外の Twitch の URL は invalid_url", () => {
    for (const u of [
      "https://www.twitch.tv/somechannel",
      "https://www.twitch.tv/videos/",
      "https://www.twitch.tv/videos/abc",
      "https://www.twitch.tv/somechannel/clip/Foo",
      "https://clips.twitch.tv/Foo",
    ])
      expect(parseVideoUrl(u)).toEqual({ ok: false, code: "invalid_url" });
  });
});

describe("Twitch のチャット取得", () => {
  test("ページをたどって全コメントを共通の形で返す", async () => {
    const { f, sent } = fakeFetch(pages.map((body) => ({ body })));
    const msgs = await fetchTwitchComments("123", f);
    expect(msgs).toEqual([
      { offsetMs: -2000, author: "early", text: "開始前" },
      { offsetMs: 1500, author: "Alice", text: "こんにちは Kappa" },
      { offsetMs: 29900, author: "bob", text: "w" },
      { offsetMs: 30000, author: "", text: "" },
      { offsetMs: 95000, author: "Carol", text: "!" },
    ]);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0].body).variables).toEqual({ videoID: "123", contentOffsetSeconds: 0 });
    expect(JSON.parse(sent[1].body).variables).toEqual({ videoID: "123", cursor: "c3" });
  });

  test("開始前を除いて30秒ごとに集計される", async () => {
    const { f } = fakeFetch(pages.map((body) => ({ body })));
    const buckets = bucketize(await fetchTwitchComments("123", f));
    expect(buckets.map((b) => b.count)).toEqual([2, 1, 0, 1]);
  });

  test("VOD がない・削除済みは video_unavailable", async () => {
    const { f } = fakeFetch([{ body: { data: { video: null } } }]);
    await expect(fetchTwitchComments("1", f)).rejects.toMatchObject({ code: "video_unavailable" });
  });

  test("429 は fetch_blocked、その他のエラーは fetch_failed", async () => {
    await expect(
      fetchTwitchComments("1", fakeFetch([{ status: 429, body: {} }]).f),
    ).rejects.toMatchObject({ code: "fetch_blocked" });
    await expect(
      fetchTwitchComments("1", fakeFetch([{ status: 500, body: {} }]).f),
    ).rejects.toMatchObject({ code: "fetch_failed" });
    const down = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const e = await fetchTwitchComments("1", down).catch((x) => x);
    expect(e).toBeInstanceOf(JobFailure);
    expect(e.code).toBe("fetch_failed");
  });
});

test("Twitch で開くリンクの時刻の形", () => {
  expect(twitchTimeParam(3725.9)).toBe("1h2m5s");
  expect(twitchTimeParam(0)).toBe("0h0m0s");
  expect(twitchTimeParam(-3)).toBe("0h0m0s");
});

describe("Twitch のタイトル取得", () => {
  test("Client ID／Secret がないときは通信せず null", async () => {
    const { f, sent } = fakeFetch([{ body: {} }]);
    expect(await fetchTwitchTitle("1", {}, f)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  test("トークンを取ってタイトルを返す。失敗しても例外にしない", async () => {
    const env = { TWITCH_CLIENT_ID: "id", TWITCH_CLIENT_SECRET: "secret" };
    const ok = fakeFetch([
      { body: { access_token: "t" } },
      { body: { data: [{ title: "配信タイトル" }] } },
    ]);
    expect(await fetchTwitchTitle("9", env, ok.f)).toBe("配信タイトル");
    expect(ok.sent[1].url).toContain("id=9");
    expect(await fetchTwitchTitle("9", env, fakeFetch([{ status: 401, body: {} }]).f)).toBeNull();
  });
});
