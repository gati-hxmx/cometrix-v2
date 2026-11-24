import { describe, expect, test } from "vitest";
import {
  chartLayout,
  drawChart,
  fitText,
  headingFor,
  IMAGE_H,
  IMAGE_W,
  intervalLabel,
} from "../src/lib/chart-image";

// グラフの画像（#69）。今見ている範囲だけを、タイトル・目盛りつきで描く。
const buckets = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ startSec: from + i * 30, count: i === 3 ? 90 : 10 }));
const img = (b = buckets(10)) => ({
  title: "配信",
  heading: "コメント数（30秒ごと）",
  unit: "件",
  buckets: b,
  bucketSec: 30,
  combine: "sum" as const,
});

describe("画像の配置", () => {
  test("棒は描く枠の中に収まり、いちばん多い棒に印", () => {
    const l = chartLayout(img());
    expect(l.bars).toHaveLength(10);
    for (const b of l.bars) {
      expect(b.x).toBeGreaterThanOrEqual(l.plot.x);
      expect(b.x + b.w).toBeLessThanOrEqual(l.plot.x + l.plot.w + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(l.plot.y);
      expect(b.y + b.h).toBeCloseTo(l.plot.y + l.plot.h);
    }
    expect(l.bars.findIndex((b) => b.peak)).toBe(3);
    expect(l.plot.x + l.plot.w).toBeLessThanOrEqual(IMAGE_W);
    expect(l.plot.y + l.plot.h).toBeLessThan(IMAGE_H);
  });

  test("時刻の目盛りと範囲は、拡大した範囲の時刻", () => {
    const l = chartLayout(img(buckets(20, 3600)));
    expect(l.span).toBe("1:00:00〜1:10:00");
    expect(l.xTicks.length).toBeGreaterThan(1);
    expect(l.xTicks[0].label).toBe("1:00:00");
    for (const t of l.xTicks) expect(t.x).toBeLessThanOrEqual(l.plot.x + l.plot.w);
  });

  test("棒が多いときはまとめる（人数は大きい方）", () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({ startSec: i * 30, count: i % 7 }));
    expect(chartLayout(img(many)).bars.length).toBeLessThanOrEqual(120);
    const l = chartLayout({ ...img(many), combine: "max" });
    expect(l.yTicks.at(-1)?.label).toBe("6");
  });
});

test("長いタイトルは「…」で切る", () => {
  const measure = (s: string) => Array.from(s).length * 10;
  expect(fitText("短い", 100, measure)).toBe("短い");
  expect(fitText("あいうえおかきくけこさしす", 60, measure)).toBe("あいうえお…");
});

test("背景・タイトル・見出し・棒・目盛りを描く", () => {
  const texts: string[] = [];
  const fills: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect() {
      fills.push(String(this.fillStyle));
    },
    fillText(t: string) {
      texts.push(t);
    },
    measureText: (s: string) => ({ width: s.length * 10 }),
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  drawChart(ctx as never, img(), {
    bg: "#fff",
    text: "#111",
    muted: "#666",
    line: "#ddd",
    bar: "#78a8e8",
    peak: "#2c5a96",
    font: "sans-serif",
  });
  expect(fills[0]).toBe("#fff");
  expect(fills.filter((f) => f === "#2c5a96")).toHaveLength(1);
  expect(texts).toContain("配信");
  expect(texts).toContain("コメント数（30秒ごと）・0:00:00〜0:05:00");
  expect(texts).toContain("Cometrix");
});

describe("棒1本の長さ", () => {
  test("まとめた棒は見出しを「5分ごと」などに直す", () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({ startSec: i * 30, count: 1 }));
    const l = chartLayout(img(many));
    expect(l.barSec).toBe(300);
    expect(headingFor("コメント数（30秒ごと）", l.barSec)).toBe("コメント数（5分ごと）");
    expect(chartLayout(img()).barSec).toBe(30);
  });

  test("長さの書き方", () => {
    expect(intervalLabel(30)).toBe("30秒");
    expect(intervalLabel(150)).toBe("2分30秒");
    expect(intervalLabel(3600)).toBe("1時間");
    expect(headingFor("コメント数", 60)).toBe("コメント数（1分ごと）");
  });
});

describe("少ない・空のとき", () => {
  test("数が全部 0 でも描け、山の印は付けない", () => {
    const l = chartLayout(img(buckets(5).map((b) => ({ ...b, count: 0 }))));
    expect(l.bars.every((b) => !b.peak && b.h === 0)).toBe(true);
    expect(l.yTicks.map((t) => t.label)).toEqual(["0", "1"]);
  });

  test("区間が1つなら棒1本で、範囲は30秒", () => {
    const l = chartLayout(img(buckets(1)));
    expect(l.bars).toHaveLength(1);
    expect(l.span).toBe("0:00:00〜0:00:30");
  });
});
