import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BucketChart, type ChartReel } from "../src/components/BucketChart";
import { ReelStatus } from "../src/components/ReelControls";

const buckets = Array.from({ length: 20 }, (_, i) => ({ startSec: i * 30, count: (i % 5) + 1 }));
const reel = (o: Partial<ChartReel> = {}): ChartReel => ({
  window: null,
  played: [],
  marks: [
    { sec: 120, n: 0, state: "done" },
    { sec: 300, n: 1, state: "now" },
    { sec: 9999, n: 2, state: "todo" },
  ],
  onPick: () => {},
  ...o,
});

describe("見どころ再生のグラフ（#61）", () => {
  it("グラフの下に番号の札を出し、範囲の外の山は出さない", () => {
    const html = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} reel={reel()} />,
    );
    expect(html).toContain('data-testid="reel-strip"');
    expect(html).toContain("見どころ 1（0:02:00）");
    expect(html).toContain("見どころ 2（0:05:00）");
    expect(html).not.toContain("見どころ 3");
    // いまの山だけ aria-current
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("再生中は、いまの範囲を塗る。再生していなければ塗らない", () => {
    const on = renderToStaticMarkup(
      <BucketChart
        buckets={buckets}
        onSeek={() => {}}
        reel={reel({ window: { start: 290, end: 320 } })}
      />,
    );
    expect(on).toContain('data-testid="reel-window"');
    const off = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} reel={reel()} />,
    );
    expect(off).not.toContain("reel-window");
  });

  it("済んだ範囲の棒は薄い青、いまの範囲の棒は濃い青", () => {
    const html = renderToStaticMarkup(
      <BucketChart
        buckets={buckets}
        onSeek={() => {}}
        reel={reel({ window: { start: 300, end: 330 }, played: [{ start: 60, end: 90 }] })}
      />,
    );
    expect(html).toContain("var(--accent-line)");
  });

  it("見どころがなければ札の列を出さない", () => {
    const html = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} reel={reel({ marks: [] })} />,
    );
    expect(html).not.toContain("reel-strip");
  });
});

describe("見どころ再生の操作（#61）", () => {
  const now = { index: 0, count: 3, peakSec: 300, remain: 18 };
  it("番号・時刻・残りを出し、最初は前へ、最後は次へを押せない", () => {
    const first = renderToStaticMarkup(
      <ReelStatus now={now} onPrev={() => {}} onNext={() => {}} onStop={() => {}} />,
    );
    expect(first).toContain("1 / 3");
    expect(first).toContain("0:05:00");
    expect(first).toContain("あと 18 秒");
    // あと N 秒は毎秒変わるので読み上げの対象に入れない
    expect(first).toMatch(/aria-hidden="true" class="reel-remain"/);
    expect(first).toMatch(/aria-label="前の見どころ" disabled=""/);
    expect(first).not.toMatch(/aria-label="次の見どころ" disabled=""/);
    const last = renderToStaticMarkup(
      <ReelStatus
        now={{ ...now, index: 2 }}
        onPrev={() => {}}
        onNext={() => {}}
        onStop={() => {}}
        compact
      />,
    );
    expect(last).toMatch(/aria-label="次の見どころ" disabled=""/);
    // 下の列（compact）でも「止める」の文字を添え、あと N 秒は省く
    expect(last).toContain('aria-label="見どころ再生を止める"');
    expect(last).toContain("止める</button>");
    expect(last).not.toContain("あと");
  });
});
