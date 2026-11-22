import { expect, test } from "vitest";
import { nearestIndex, pickPeaks } from "../src/lib/toc";

const mk = (counts: number[]) => counts.map((count, i) => ({ startSec: i * 30, count }));
const counts = (c: number[]) => pickPeaks(mk(c)).map((p) => p.count);

test("空・全部0・山がないときは空", () => {
  expect(pickPeaks([])).toEqual([]);
  expect(pickPeaks(mk([0, 0, 0]))).toEqual([]);
  expect(pickPeaks(mk([2, 2, 2, 2]))).toEqual([]);
});

test("平均以下・3件未満は山にしない", () => {
  expect(pickPeaks(mk([0, 0, 0, 0, 0, 0, 0, 0, 0, 2]))).toEqual([]);
  expect(pickPeaks(mk([10, 10, 10, 3]))).toEqual([{ startSec: 0, count: 10 }]);
});

test("数の多い順に並べ、同数は早い時刻が先", () => {
  const c = mk([0, 5, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0]);
  expect(pickPeaks(c).map((p) => [p.startSec, p.count])).toEqual([
    [210, 9],
    [30, 5],
    [510, 5],
  ]);
});

test("120秒より近い山は多いほうだけ残す。ちょうど120秒は別の山", () => {
  expect(counts([0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 8, 0, 0, 0, 0, 0, 0, 0])).toEqual([8]);
  expect(counts([0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0])).toEqual([8, 6]);
});

test("同数が続く山は最初の1つ、上位10件まで", () => {
  expect(
    pickPeaks(mk([0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 0, 0, 0, 0, 0, 0])).map((p) => p.startSec),
  ).toEqual([210]);
  const many = mk(Array.from({ length: 80 }, (_, i) => (i % 5 === 0 ? 10 + i : 0)));
  const out = pickPeaks(many);
  expect(out).toHaveLength(10);
  expect(out[0].count).toBe(10 + 75);
});

test("再生位置にいちばん近い山を返す", () => {
  const e = [
    { startSec: 300, count: 9 },
    { startSec: 60, count: 5 },
  ];
  expect(nearestIndex(e, 100)).toBe(1);
  expect(nearestIndex(e, 250)).toBe(0);
  expect(nearestIndex([], 10)).toBe(-1);
});
