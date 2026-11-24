import { describe, expect, test } from "vitest";
import {
  alignShifts,
  axisLength,
  bandRuns,
  clampAdj,
  compareQuery,
  formatShift,
  normalize,
  parseCompare,
  quantile,
  shiftCounts,
  togetherBands,
  togetherNeed,
  valueText,
  videoSecAt,
} from "../src/lib/compare";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";
const D = "44444444-4444-4444-4444-444444444444";
const E = "55555555-5555-5555-5555-555555555555";

describe("URL（#63）", () => {
  test("正しい id だけを、重ならず 4 本まで読む。adj は同じ並び", () => {
    const p = parseCompare(
      new URLSearchParams(`ids=${A},x,${B},${A},${C},${D},${E}&adj=5,9,-3,1,2,4,6`),
    );
    expect(p.ids).toEqual([A, B, C, D]);
    expect(p.adj).toEqual([5, -3, 2, 4]);
  });
  test("adj がない・おかしいときは 0。±1 時間で止める", () => {
    expect(parseCompare(new URLSearchParams(`ids=${A},${B}`)).adj).toEqual([0, 0]);
    expect(parseCompare(new URLSearchParams(`ids=${A},${B}&adj=abc,99999`)).adj).toEqual([0, 3600]);
    expect(clampAdj(-5000)).toBe(-3600);
    expect(clampAdj(1.6)).toBe(2);
  });
  test("compareQuery は parseCompare に戻せる。直していなければ adj を付けない", () => {
    expect(compareQuery({ ids: [A, B], adj: [0, 0] })).toBe(`ids=${A},${B}`);
    const q = compareQuery({ ids: [A, B], adj: [0, -12] });
    expect(q).toBe(`ids=${A},${B}&adj=0,-12`);
    expect(parseCompare(new URLSearchParams(q))).toEqual({ ids: [A, B], adj: [0, -12] });
  });
});

describe("時刻を合わせる", () => {
  test("いちばん早い配信を 0 にし、手で直した分を足す", () => {
    const r = alignShifts([1000, 1012, 959], [0, 0, 0]);
    expect(r.shifts).toEqual([41, 53, 0]);
    expect(r.unknown).toEqual([false, false, false]);
    expect(alignShifts([1000, 1012], [0, 3]).shifts).toEqual([0, 15]);
  });
  test("早めすぎてマイナスになったら、全体をずらして最小を 0 にする", () => {
    expect(alignShifts([1000, 1000], [0, -10]).shifts).toEqual([10, 0]);
  });
  test("開始の時刻がわからない配信は、いちばん早い配信にそろえ、unknown で知らせる", () => {
    const r = alignShifts([1000, null, 1030], [0, 0, 0]);
    expect(r.shifts).toEqual([0, 0, 30]);
    expect(r.unknown).toEqual([false, true, false]);
    expect(alignShifts([undefined, undefined], [0, 5]).shifts).toEqual([0, 5]);
  });
  test("ずれの文字", () => {
    expect(formatShift(0)).toBe("基準");
    expect(formatShift(12)).toBe("+0:12");
    expect(formatShift(-41)).toBe("−0:41");
    expect(formatShift(65)).toBe("+1:05");
    expect(formatShift(3723)).toBe("+1:02:03");
  });
});

describe("30 秒ごとの数を置き直す", () => {
  test("30 秒の倍数のずれは、そのまま区間を動かす。配信していない区間は null", () => {
    expect(shiftCounts([10, 20, 30], 60, 6)).toEqual([null, null, 10, 20, 30, null]);
  });
  test("半端なずれは重なりの割合で分け、合計は変わらない", () => {
    const out = shiftCounts([30, 60], 15, 3);
    expect(out).toEqual([15, 45, 30]);
    expect((out as number[]).reduce((a, b) => a + b, 0)).toBe(90);
  });
  test("軸の長さはいちばん遅く終わる配信まで", () => {
    expect(axisLength([3, 2], [0, 75])).toBe(5);
  });
  test("videoSecAt：共通の時刻から動画の時刻へ。範囲外は null", () => {
    expect(videoSecAt(100, 41, 600)).toBe(59);
    expect(videoSecAt(0, 41, 600)).toBeNull();
    // 区間の途中で始まった配信は、その区間を押すと 0 秒から
    expect(videoSecAt(30, 41, 600)).toBe(0);
    expect(videoSecAt(700, 41, 600)).toBeNull();
  });
});

describe("一緒に盛り上がった所（帯）", () => {
  test("分位は null を除いて数える", () => {
    expect(quantile([null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.85)).toBe(9);
    expect(quantile([null], 0.85)).toBe(Number.POSITIVE_INFINITY);
  });
  test("3 本以上なら 3 本、2 本なら 2 本が自分の上位 15% に入った区間", () => {
    expect(togetherNeed(2)).toBe(2);
    expect(togetherNeed(4)).toBe(3);
    const low = Array.from({ length: 20 }, () => 1);
    const peak = (k: number) => low.map((v, i) => (i === k ? 50 : v));
    // 0 番目の区間は 3 本、5 番目は 2 本だけ
    const s = [peak(0), peak(0), peak(0).map((v, i) => (i === 5 ? 60 : v)), peak(5)];
    const bands = togetherBands(s);
    expect(bands[0]).toBe(true);
    expect(bands[5]).toBe(false);
    expect(bandRuns([false, true, true, false, true])).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
    ]);
  });
  test("0 件の区間や配信していない区間は盛り上がりに数えない", () => {
    const zero = Array.from({ length: 10 }, () => 0);
    expect(togetherBands([zero, zero]).some(Boolean)).toBe(false);
    expect(
      togetherBands([
        [null, 5],
        [null, 5],
      ])[0],
    ).toBe(false);
  });
});

describe("割合", () => {
  test("各配信の最大を 100 にする。null はそのまま", () => {
    expect(normalize([null, 5, 10])).toEqual([null, 50, 100]);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
  test("値の文字", () => {
    expect(valueText(1234.4, false)).toBe("1,234 件");
    expect(valueText(42.6, true)).toBe("43%");
    expect(valueText(null, true)).toBe("—");
  });
});
