import { expect, test } from "vitest";
import { formatTime, groupBuckets, peakIndex } from "../src/lib/chart";

const b = (startSec: number, count: number) => ({ startSec, count });

test("棒が上限以下ならまとめない", () => {
  const input = [b(0, 1), b(30, 2), b(60, 3)];
  expect(groupBuckets(input, 10)).toEqual(input);
});

test("棒が多いと区間をまとめ、コメント数は合計・開始は先頭の区間", () => {
  const input = Array.from({ length: 10 }, (_, i) => b(i * 30, i + 1));
  const out = groupBuckets(input, 5);
  expect(out).toHaveLength(5);
  expect(out[0]).toEqual(b(0, 3));
  expect(out[1]).toEqual(b(60, 7));
  expect(out[4]).toEqual(b(240, 19));
  expect(out.reduce((s, x) => s + x.count, 0)).toBe(55);
});

test("割り切れなくても上限を超えず、端数は最後の棒に入る", () => {
  const input = Array.from({ length: 11 }, (_, i) => b(i * 30, 1));
  const out = groupBuckets(input, 5);
  expect(out.length).toBeLessThanOrEqual(5);
  expect(out.reduce((s, x) => s + x.count, 0)).toBe(11);
});

test("空の入力は空", () => {
  expect(groupBuckets([], 10)).toEqual([]);
});

test("ピークは最大の最初の1つ。全部0ならなし", () => {
  expect(peakIndex([b(0, 1), b(30, 5), b(60, 5)])).toBe(1);
  expect(peakIndex([b(0, 0), b(30, 0)])).toBe(-1);
  expect(peakIndex([])).toBe(-1);
});

test("時刻は h:mm:ss", () => {
  expect(formatTime(0)).toBe("0:00:00");
  expect(formatTime(90)).toBe("0:01:30");
  expect(formatTime(3661)).toBe("1:01:01");
});
