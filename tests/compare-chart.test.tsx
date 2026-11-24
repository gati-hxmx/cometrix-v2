import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompareChart, segments } from "../src/components/CompareChart";

const lines = [
  { key: "a", name: "あおい", color: "var(--v-1)", values: [1, 5, 2, null] },
  { key: "b", name: "とても長い配信者の名前", color: "var(--v-2)", values: [null, 3, 4, 1] },
];
const render = (o: { cursor?: number | null; ratio?: boolean } = {}) =>
  renderToStaticMarkup(
    <CompareChart
      lines={lines}
      bands={[false, true, true, false]}
      ratio={o.ratio ?? false}
      cursor={o.cursor ?? null}
      focus={0}
      onCursor={() => {}}
      label="重ねたグラフ"
    />,
  );

describe("重ねたグラフ（#63）", () => {
  it("配信ごとの線を、配信していない所で切って描き、続いた帯は1つにまとめる", () => {
    const html = render();
    expect(html.match(/data-line="a"/g)).toHaveLength(1);
    expect(html.match(/data-line="b"/g)).toHaveLength(1);
    expect(html.match(/data-testid="together-band"/g)).toHaveLength(1);
    expect(html).not.toContain("compare-tip");
  });
  it("縦線を引くと、小窓にその時刻の全員の数を出す。割合なら %", () => {
    const html = render({ cursor: 1 });
    expect(html).toContain('data-testid="compare-cursor"');
    expect(html).toContain("0:00:30");
    expect(html).toContain("5 件");
    expect(html).toContain("3 件");
    expect(render({ cursor: 1, ratio: true })).toContain("5%");
  });
  it("キーボードで動かせる（slider と時刻の読み上げ）", () => {
    const html = render({ cursor: 2 });
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuetext="0:01:00"');
  });
  it("segments：null で切れた区間", () => {
    expect(segments([1, null, 2, 3, null])).toEqual([[0], [2, 3]]);
  });
});
