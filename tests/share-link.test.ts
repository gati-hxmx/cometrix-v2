import { expect, test } from "vitest";
import { newShareToken, SHARE_TOKEN } from "../src/lib/share-link";
import { loadOgpFont, ogpBars, ogpTitle } from "../src/lib/share-ogp";
import { parseStartSec, sharePath } from "../src/lib/share-url";

// 共有リンク（#68）。
test("鍵は 22 文字で、毎回ちがう", () => {
  const a = newShareToken();
  expect(a).toMatch(SHARE_TOKEN);
  expect(newShareToken()).not.toBe(a);
});

test("リンクは /s/鍵、時刻があれば ?t=秒", () => {
  expect(sharePath("abc")).toBe("/s/abc");
  expect(sharePath("abc", 0)).toBe("/s/abc");
  expect(sharePath("abc", 95.7)).toBe("/s/abc?t=95");
});

test("?t= は秒・1m30s・1h2m3s を読み、ほかは null", () => {
  expect(parseStartSec("90")).toBe(90);
  expect(parseStartSec("1m30s")).toBe(90);
  expect(parseStartSec("1h2m3s")).toBe(3723);
  expect(parseStartSec(["45", "10"])).toBe(45);
  for (const v of [undefined, "", "abc", "-5", "1.5", "h", "9999999"])
    expect(parseStartSec(v)).toBeNull();
});

test("SNS の絵の棒は 96 本までにまとめ、いちばん高い棒に印", () => {
  const buckets = Array.from({ length: 1200 }, (_, i) => ({
    startSec: i * 30,
    count: i === 600 ? 500 : 1,
  }));
  const bars = ogpBars(buckets);
  expect(bars.length).toBeLessThanOrEqual(96);
  expect(bars.filter((b) => b.peak)).toHaveLength(1);
  expect(Math.max(...bars.map((b) => b.h))).toBe(1);
  expect(ogpBars([])).toEqual([]);
  expect(ogpBars([{ startSec: 0, count: 0 }])).toEqual([{ h: 0, peak: false }]);
});

test("長いタイトルは … で切り、空なら代わりの文", () => {
  expect(ogpTitle("あ".repeat(80))).toBe(`${"あ".repeat(59)}…`);
  expect(ogpTitle("短い")).toBe("短い");
  expect(ogpTitle("  ")).toBe("配信の盛り上がり");
});

test("字は使う字だけを取り、取れなければ null", async () => {
  const urls: string[] = [];
  const ok = (async (u: string) => {
    urls.push(String(u));
    return String(u).includes("googleapis")
      ? new Response("src: url(https://fonts.gstatic.com/x.ttf) format('truetype');")
      : new Response(new Uint8Array([1, 2, 3]));
  }) as typeof fetch;
  expect((await loadOgpFont("配信", ok))?.byteLength).toBe(3);
  expect(urls[0]).toContain(`text=${encodeURIComponent("配信")}`);
  const down = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  expect(await loadOgpFont("配信", down)).toBeNull();
  const woff2 = (async () =>
    new Response("src: url(https://x/y.woff2) format('woff2');")) as typeof fetch;
  expect(await loadOgpFont("配信", woff2)).toBeNull();
});
