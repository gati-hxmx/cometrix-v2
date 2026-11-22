import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BucketChart } from "../src/components/BucketChart";
import { TocPanel } from "../src/components/TocPanel";

// 人数のグラフ（#55）は、数に「人」を付ける（オーナーがよく指摘すること 8）。
const buckets = Array.from({ length: 6 }, (_, i) => ({ startSec: i * 30, count: i + 1 }));

describe("人数のグラフの単位", () => {
  it("棒の説明は「N 人」", () => {
    const html = renderToStaticMarkup(<BucketChart buckets={buckets} onSeek={() => {}} users />);
    expect(html).toContain("0:00:00 から 1 人");
    expect(html).not.toContain("コメント");
    // 縦の目盛りの単位も「人」
    expect(html).not.toContain(">件<");
    expect(html).toContain(">人<");
  });

  it("目次も「N 人」", () => {
    const html = renderToStaticMarkup(
      <TocPanel buckets={buckets} laugh={false} users getTime={() => 0} onSeek={() => {}} />,
    );
    expect(html).toContain("6 人");
    expect(html).not.toContain("件");
  });

  it("棒をまとめているときは「30秒あたり最多 N 人」", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ startSec: i * 30, count: i % 7 }));
    const html = renderToStaticMarkup(<BucketChart buckets={many} onSeek={() => {}} users />);
    expect(html).toContain("30秒あたり最多 6 人");
  });
});
