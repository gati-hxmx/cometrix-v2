import { describe, expect, it } from "vitest";
import {
  clampRange,
  MIN_RANGE,
  panRange,
  revealIndex,
  snapRange,
  timeTicks,
  valueTicks,
  zoomRange,
} from "../src/lib/chart-range";

describe("拡大範囲の計算", () => {
  const all = { start: 0, end: 720 };
  it("拡大してもアンカーの下の位置は動かない", () => {
    expect(zoomRange(all, 720, 0.5, 0.5)).toEqual({ start: 180, end: 540 });
    expect(zoomRange(all, 720, 0, 0.5)).toEqual({ start: 0, end: 360 });
    expect(zoomRange(all, 720, 1, 0.5)).toEqual({ start: 360, end: 720 });
  });
  it("下限より狭くならない", () => {
    const r = zoomRange({ start: 100, end: 120 }, 720, 0.5, 0.1);
    expect(r.end - r.start).toBe(MIN_RANGE);
  });
  it("全体より広くならず、全体で縮小しても変わらない", () => {
    expect(zoomRange(all, 720, 0.3, 2)).toEqual(all);
    const r = zoomRange({ start: 600, end: 700 }, 720, 1, 4);
    expect(r).toEqual({ start: 300, end: 700 });
  });
  it("全体が下限より短ければ全体のまま", () => {
    expect(zoomRange({ start: 0, end: 5 }, 5, 0.5, 0.1)).toEqual({ start: 0, end: 5 });
    expect(clampRange({ start: 3, end: 1 }, 5)).toEqual({ start: 0, end: 5 });
  });
  it("横移動は端で止まり、幅を変えない", () => {
    const r = { start: 100, end: 200 };
    expect(panRange(r, 720, 50)).toEqual({ start: 150, end: 250 });
    expect(panRange(r, 720, -500)).toEqual({ start: 0, end: 100 });
    expect(panRange(r, 720, 900)).toEqual({ start: 620, end: 720 });
  });
  it("選んだ区間が範囲外なら最小限だけ動かして見えるようにする", () => {
    const r = { start: 100, end: 200 };
    expect(revealIndex(r, 720, 150)).toEqual(r);
    expect(revealIndex(r, 720, 99)).toEqual({ start: 99, end: 199 });
    expect(revealIndex(r, 720, 200)).toEqual({ start: 101, end: 201 });
  });
  it("データなしは空の範囲", () => {
    expect(clampRange({ start: 0, end: 10 }, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("目盛り", () => {
  it("時刻の目盛りは10本以下で、間隔の倍数に置く", () => {
    const t = timeTicks(0, 6 * 3600);
    expect(t.length).toBeLessThanOrEqual(10);
    expect(t.length).toBeGreaterThan(2);
    expect(t.every((x) => x % 3600 === 0)).toBe(true);
    expect(timeTicks(0, 300)).toEqual(
      [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300].filter((x) => x % 60 === 0),
    );
  });
  it("拡大すると間隔が細かくなる", () => {
    expect(timeTicks(1000, 1300).every((x) => x % 60 === 0)).toBe(true);
  });
  it("幅が0以下なら目盛りなし", () => {
    expect(timeTicks(10, 10)).toEqual([]);
  });
  it("縦軸は 0 から最大を覆うきりのいい数", () => {
    expect(valueTicks(0)).toEqual([0]);
    expect(valueTicks(1)).toEqual([0, 1]);
    expect(valueTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(valueTicks(100)).toEqual([0, 50, 100]);
    const v = valueTicks(137);
    expect(v[0]).toBe(0);
    expect(v[v.length - 1]).toBeGreaterThanOrEqual(137);
    expect(v.length).toBeLessThanOrEqual(6);
  });
});

describe("snapRange", () => {
  it("小数の範囲を整数にそろえ、幅を保つ", () => {
    expect(snapRange({ start: 9.9, end: 50.1 }, 60)).toEqual({ start: 10, end: 50 });
    expect(snapRange({ start: 4.4, end: 14.6 }, 60)).toEqual({ start: 4, end: 14 });
  });
  it("端を越えない", () => {
    expect(snapRange({ start: 49.6, end: 59.9 }, 60)).toEqual({ start: 50, end: 60 });
    expect(snapRange({ start: -0.4, end: 9.7 }, 60)).toEqual({ start: 0, end: 10 });
  });
  it("拡大・移動の結果を、そのまま区間の番号として使える", () => {
    const r = snapRange(zoomRange({ start: 0, end: 60 }, 60, 0.37, 0.67), 60);
    expect(Number.isInteger(r.start) && Number.isInteger(r.end)).toBe(true);
    const p = snapRange(panRange(r, 60, 3.3), 60);
    expect(Number.isInteger(p.start) && Number.isInteger(p.end)).toBe(true);
  });
});
