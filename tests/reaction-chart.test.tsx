import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BucketChart } from "../src/components/BucketChart";
import { ReactionChips } from "../src/components/ReactionChips";
import { emptyReactionBucket } from "../src/lib/reactions";

const buckets = Array.from({ length: 4 }, (_, i) => ({ startSec: i * 30, count: 10 }));
const rows = buckets.map((b) => ({
  ...emptyReactionBucket(b.startSec),
  laugh: 6,
  god: 3,
  other: 1,
}));

describe("反応の積み上げ（#62）", () => {
  it("棒を種類ごとに積み、数のない種類は描かない", () => {
    const html = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} stack={{ rows, focus: null }} />,
    );
    expect(html).toContain('data-kind="laugh"');
    expect(html).toContain('data-kind="god"');
    expect(html).not.toContain('data-kind="clap"');
    expect(html).toContain("var(--r-laugh)");
    expect(html).not.toContain("opacity:0.22");
  });

  it("選んだ種類をいちばん下に置き、ほかを薄くする", () => {
    const html = renderToStaticMarkup(
      <BucketChart buckets={buckets} onSeek={() => {}} stack={{ rows, focus: "god" }} />,
    );
    // column-reverse なので、最初の子がいちばん下
    const first = /data-kind="(\w+)"/.exec(html)?.[1];
    expect(first).toBe("god");
    expect(html).toContain("opacity:0.22");
  });

  it("積み上げないときは、今までどおり1色の棒", () => {
    const html = renderToStaticMarkup(<BucketChart buckets={buckets} onSeek={() => {}} />);
    expect(html).not.toContain("data-kind");
  });
});

describe("反応の札（#62）", () => {
  const totals = { laugh: 30, clap: 0, wow: 0, cute: 0, god: 10, cry: 0, other: 60 };
  it("すべてと6つの種類を出し、選んだ札だけ押した状態", () => {
    const html = renderToStaticMarkup(
      <ReactionChips totals={totals} focus="god" onFocus={() => {}} />,
    );
    for (const n of ["すべて", "笑い", "拍手", "驚き", "かわいい", "神", "泣き"])
      expect(html).toContain(n);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("神 10 件（全体の 10%）");
  });

  it("選んでいないときは割合の文を出さない", () => {
    const html = renderToStaticMarkup(
      <ReactionChips totals={totals} focus={null} onFocus={() => {}} />,
    );
    expect(html).not.toContain("全体の");
  });
});
