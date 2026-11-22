import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BucketChart } from "../src/components/BucketChart";

const buckets = Array.from({ length: 20 }, (_, i) => ({ startSec: i * 30, count: i % 5 }));
const clip = {
  id: "a",
  title: "名場面",
  url: "https://clips.twitch.tv/a",
  offsetSec: 100,
  durationSec: 30,
};

describe("グラフのクリップの印（#60）", () => {
  it("クリップがあれば、時刻つきの印を出す", () => {
    const html = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} clips={[clip]} />,
    );
    expect(html).toContain('data-testid="clip-mark"');
    expect(html).toContain("クリップ 0:01:40 名場面");
  });

  it("クリップがないときは、印も説明も出さない", () => {
    const html = renderToStaticMarkup(<BucketChart buckets={buckets} onSeek={() => {}} />);
    expect(html).not.toContain("clip-mark");
    expect(html).not.toContain("クリップ");
  });

  it("グラフの範囲の外のクリップは出さない", () => {
    const html = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} clips={[{ ...clip, offsetSec: 99999 }]} />,
    );
    expect(html).not.toContain("clip-mark");
  });
});
