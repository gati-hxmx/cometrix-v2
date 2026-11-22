import { describe, expect, test } from "vitest";
import { cleanClips, isSafeClipUrl } from "../src/lib/clips";
import { fetchTwitchInfo, parseClips, parseTwitchDuration } from "../src/worker/twitch-chat";

describe("クリップの URL と整形", () => {
  test("クリップのページとして開いてよい URL", () => {
    expect(isSafeClipUrl("https://clips.twitch.tv/abc")).toBe(true);
    expect(isSafeClipUrl("https://www.twitch.tv/x/clip/abc")).toBe(true);
    expect(isSafeClipUrl("http://clips.twitch.tv/abc")).toBe(false);
    expect(isSafeClipUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeClipUrl("https://evil.example/clips.twitch.tv")).toBe(false);
    expect(isSafeClipUrl(null)).toBe(false);
  });

  test("保存された clips を整える。ない・壊れているときは空", () => {
    expect(cleanClips(undefined)).toEqual([]);
    expect(cleanClips("x")).toEqual([]);
    const ok = {
      id: "a",
      title: "t",
      url: "https://clips.twitch.tv/a",
      offsetSec: 5,
      durationSec: 30,
    };
    expect(
      cleanClips([
        ok,
        { ...ok, id: "b", url: "javascript:1" },
        { ...ok, id: "c", offsetSec: -1 },
        3,
      ]),
    ).toEqual([ok]);
  });
});

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const sent: string[] = [];
  let i = 0;
  const f = (async (url: string) => {
    sent.push(String(url));
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, sent };
}

describe("Twitch のクリップ取得（#60）", () => {
  const env = { TWITCH_CLIENT_ID: "id", TWITCH_CLIENT_SECRET: "secret" };
  const video = {
    data: [{ title: "T", user_id: "55", created_at: "2026-01-01T00:00:00Z", duration: "1h0m0s" }],
  };
  const clip = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    url: `https://clips.twitch.tv/${id}`,
    title: `clip ${id}`,
    video_id: "9",
    vod_offset: 100,
    duration: 29.9,
    ...over,
  });

  test("長さの読み取り", () => {
    expect(parseTwitchDuration("1h2m3s")).toBe(3723);
    expect(parseTwitchDuration("45s")).toBe(45);
    expect(parseTwitchDuration("")).toBeNull();
    expect(parseTwitchDuration("abc")).toBeNull();
  });

  test("この VOD のクリップだけを、時刻つきで取る", () => {
    const body = {
      data: [
        clip("a", { vod_offset: 300 }),
        clip("b", { video_id: "8" }),
        clip("c", { vod_offset: null }),
        clip("d", { url: "javascript:alert(1)" }),
        clip("e", { vod_offset: 99999 }),
      ],
    };
    expect(parseClips(body, "9", 3600)).toEqual([
      {
        id: "a",
        title: "clip a",
        url: "https://clips.twitch.tv/a",
        offsetSec: 300,
        durationSec: 30,
      },
    ]);
  });

  test("クリップがない・壊れた応答は空", () => {
    expect(parseClips({ data: [] }, "9")).toEqual([]);
    expect(parseClips(null, "9")).toEqual([]);
    expect(parseClips({ data: "x" }, "9")).toEqual([]);
  });

  test("鍵がないときは通信せず、クリップは空", async () => {
    const { f, sent } = fakeFetch([{ body: {} }]);
    expect(await fetchTwitchInfo("9", {}, f)).toEqual({ title: null, clips: [] });
    expect(sent).toHaveLength(0);
  });

  test("ページ送りして、同じクリップは1件にし、時刻順で返す", async () => {
    const { f, sent } = fakeFetch([
      { body: { access_token: "t" } },
      { body: video },
      { body: { data: [clip("b", { vod_offset: 500 })], pagination: { cursor: "next" } } },
      { body: { data: [clip("a", { vod_offset: 100 }), clip("b", { vod_offset: 500 })] } },
    ]);
    const info = await fetchTwitchInfo("9", env, f);
    expect(info.title).toBe("T");
    expect(info.clips.map((c) => c.id)).toEqual(["a", "b"]);
    expect(sent[2]).toContain("broadcaster_id=55");
    expect(sent[3]).toContain("after=next");
  });

  test("クリップの取得が失敗しても、タイトルは返す", async () => {
    const { f } = fakeFetch([
      { body: { access_token: "t" } },
      { body: video },
      { status: 500, body: {} },
    ]);
    expect(await fetchTwitchInfo("9", env, f)).toEqual({ title: "T", clips: [] });
  });
});
