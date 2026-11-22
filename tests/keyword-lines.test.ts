import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BucketChart } from "../src/components/BucketChart";
import { KeywordLines } from "../src/components/KeywordLines";

const buckets = [0, 30, 60, 90].map((startSec, i) => ({ startSec, count: (i + 1) * 10 }));
const kusa = [0, 30, 60, 90].map((startSec, i) => ({ startSec, count: i }));

describe("言葉の線（#53）", () => {
  it("言葉がなければ線も右の軸も出さない", () => {
    const html = renderToStaticMarkup(h(BucketChart, { buckets, onSeek: () => {} }));
    expect(html).not.toContain("keyword-lines");
    expect(html).not.toContain("言葉（件）");
  });

  it("言葉ごとに線を1本、系列色で描き、右の軸と棒の説明に件数を足す", () => {
    const html = renderToStaticMarkup(
      h(BucketChart, {
        buckets,
        onSeek: () => {},
        lines: [{ term: "草", color: "var(--chart-2)", buckets: kusa }],
      }),
    );
    expect(html).toContain('data-term="草"');
    expect(html).toContain('stroke="var(--chart-2)"');
    expect(html).toContain("言葉（件）");
    expect(html).toContain("0:01:30 から 40 コメント・「草」3 件");
  });

  it("入力欄：2つ入れたら入力できず、札に色の印と件数・外すボタンを出す", () => {
    const html = renderToStaticMarkup(
      h(KeywordLines, {
        total: 100,
        onChange: () => {},
        items: [
          { term: "草", color: "var(--chart-2)", count: 12 },
          { term: "lol", color: "var(--chart-3)", count: null },
        ],
      }),
    );
    expect(html).toContain("重ねられるのは 2 つまでです");
    expect(html).toContain("disabled");
    expect(html).toContain("「草」12 / 全 100 件");
    expect(html).toContain('aria-label="草 を外す"');
    expect(html).toContain("var(--chart-3)");
  });
});
