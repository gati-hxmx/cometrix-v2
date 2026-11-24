import { expect, test } from "vitest";
import {
  parseReel,
  REEL_DEFAULT,
  REEL_GRACE_MS,
  reelDurationSec,
  reelKeyValue,
  reelPlan,
  reelSettingText,
  reelStep,
  reelTotalSec,
  reelTotalText,
  stripLayout,
} from "../src/lib/reel";

const toc = [
  { startSec: 600, count: 90 },
  { startSec: 10, count: 80 },
  { startSec: 1200, count: 70 },
];

test("保存した設定を読み、壊れた値は初期値", () => {
  expect(parseReel("5-20")).toEqual({ count: 5, len: 20 });
  expect(parseReel("0-60")).toEqual({ count: 0, len: 60 });
  expect(parseReel(reelKeyValue({ count: 7, len: 30 }))).toEqual({ count: 7, len: 30 });
  for (const bad of [null, undefined, "", "6-30", "7-25", "7", "x-y", "7-30-1"])
    expect(parseReel(bad)).toEqual(REEL_DEFAULT);
});

test("目次の順に、山の少し前から決まった長さで並べる。0 秒より前にはならない", () => {
  expect(reelPlan(toc, { count: 7, len: 30 }, 20)).toEqual([
    { n: 0, peakSec: 600, start: 580, end: 610 },
    { n: 1, peakSec: 10, start: 0, end: 30 },
    { n: 2, peakSec: 1200, start: 1180, end: 1210 },
  ]);
});

test("上位いくつかに絞る。全部（0）は目次の山すべて", () => {
  expect(reelPlan(toc, { count: 5, len: 20 }, 0)).toHaveLength(3);
  const many = Array.from({ length: 10 }, (_, i) => ({ startSec: i * 300, count: 100 - i }));
  expect(reelPlan(many, { count: 5, len: 20 }, 0).map((x) => x.n)).toEqual([0, 1, 2, 3, 4]);
  expect(reelPlan(many, { count: 0, len: 20 }, 0)).toHaveLength(10);
  expect(reelTotalSec(many, { count: 7, len: 30 })).toBe(210);
  expect(reelTotalSec(toc, { count: 7, len: 30 })).toBe(90);
});

test("合計の長さと設定の言い方", () => {
  expect(reelTotalText(210)).toBe("約 3 分 30 秒");
  expect(reelTotalText(120)).toBe("約 2 分");
  expect(reelTotalText(40)).toBe("約 40 秒");
  expect(reelSettingText({ count: 7, len: 30 })).toBe("上位 7・30 秒");
  expect(reelSettingText({ count: 0, len: 60 })).toBe("全部・60 秒");
});

const plan = reelPlan(toc, { count: 7, len: 30 }, 20);
const late = REEL_GRACE_MS;

test("範囲の中では残りの秒数を返す", () => {
  expect(reelStep(plan, 0, 590, late)).toEqual({ kind: "stay", remain: 20 });
  // 再生が始まる前（少し手前）でも、範囲の長さを残りとして出す
  expect(reelStep(plan, 0, 579, late)).toEqual({ kind: "stay", remain: 30 });
});

test("終わりまで来たら次へ、最後なら終わる", () => {
  expect(reelStep(plan, 0, 610, late)).toEqual({ kind: "next", index: 1 });
  expect(reelStep(plan, 1, 31, late)).toEqual({ kind: "next", index: 2 });
  expect(reelStep(plan, 2, 1210, late)).toEqual({ kind: "done" });
  expect(reelStep(plan, 3, 0, late)).toEqual({ kind: "done" });
});

test("範囲から外れたら（自分で動かした）止める", () => {
  expect(reelStep(plan, 0, 100, late)).toEqual({ kind: "left" });
  expect(reelStep(plan, 0, 900, late)).toEqual({ kind: "left" });
});

test("動かした直後は、前の位置が返っても止めず、次へも進まない", () => {
  // 0 番目へ動かした直後に、まだ前の位置（ずっと後ろ）が返る
  expect(reelStep(plan, 0, 900, 500)).toEqual({ kind: "stay", remain: 30 });
  // ずっと前の位置が返る
  expect(reelStep(plan, 0, 100, 500)).toEqual({ kind: "stay", remain: 30 });
  // 直後でも、範囲の終わりちょうどなら次へ
  expect(reelStep(plan, 0, 611, 500)).toEqual({ kind: "next", index: 1 });
});

test("番号の札を重ならないよう段に分け、入らないときは右へずらす", () => {
  const rows = (xs: number[]) => stripLayout(xs, 40).map((p) => p.row);
  expect(rows([10, 60, 110])).toEqual([0, 0, 0]);
  expect(rows([10, 30, 50, 120])).toEqual([0, 1, 0, 0]);
  // 並び順に関係なく左から決める
  expect(rows([50, 10, 30])).toEqual([0, 0, 1]);
  // 3つめは段が足りないので、空いている段（0 段目）で前の札のすぐ右へ
  // （左端の札は、半分が左へはみ出さないよう 20 まで寄せる）
  expect(stripLayout([110, 120, 130], 40)).toEqual([
    { row: 0, x: 110 },
    { row: 1, x: 120 },
    { row: 0, x: 150 },
  ]);
  expect(stripLayout([10, 20, 30], 40)).toEqual([
    { row: 0, x: 20 },
    { row: 1, x: 20 },
    { row: 0, x: 60 },
  ]);
  // ずらした札の後ろの札も重ならない
  const placed = stripLayout([0, 5, 10, 15, 20], 40);
  for (const r of [0, 1]) {
    const xs = placed.filter((p) => p.row === r).map((p) => p.x);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeGreaterThanOrEqual(40);
  }
});

test("札は幅からはみ出さず、寄せても重ならない", () => {
  const placed = stripLayout([250, 262, 274, 286, 298], 48, 300);
  for (const p of placed) {
    expect(p.x).toBeGreaterThanOrEqual(24);
    expect(p.x).toBeLessThanOrEqual(276);
  }
  for (const r of [0, 1]) {
    const xs = placed
      .filter((p) => p.row === r)
      .map((p) => p.x)
      .sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeGreaterThanOrEqual(48);
  }
  // 左端も
  expect(stripLayout([0], 48, 300)[0].x).toBe(24);
});

test("動画の終わりの山は、動画の長さで終わりをそろえる", () => {
  const items = reelPlan([{ startSec: 3600, count: 9 }], { count: 7, len: 30 }, 20, 3605);
  expect(items[0]).toMatchObject({ start: 3580, end: 3605 });
  // 動画の長さより後ろから始まることもない
  const late = reelPlan([{ startSec: 3600, count: 9 }], { count: 7, len: 30 }, 0, 3600);
  expect(late[0].start).toBeLessThan(3600);
  expect(late[0].end).toBeGreaterThan(late[0].start);
});

test("動画が最後まで来て止まったら、次へ（最後なら終わり）", () => {
  const two = reelPlan(toc.slice(0, 2), { count: 7, len: 30 }, 20);
  expect(reelStep(two, 0, 600, REEL_GRACE_MS, true)).toEqual({ kind: "next", index: 1 });
  expect(reelStep(two, 1, 20, REEL_GRACE_MS, true)).toEqual({ kind: "done" });
  // 動かした直後は、前の動画の「終わった」を見ない
  expect(reelStep(two, 0, 590, 500, true)).toEqual({ kind: "stay", remain: 20 });
});

test("最後の区間がない古い分析は長さの上限を付けず、山の位置で再生する", () => {
  expect(reelDurationSec(3570)).toBe(3600);
  expect(reelDurationSec(0)).toBe(30);
  expect(reelDurationSec(undefined)).toBeUndefined();
  expect(reelDurationSec(null)).toBeUndefined();
  expect(reelDurationSec(Number.NaN)).toBeUndefined();
  const items = reelPlan(toc, { count: 7, len: 30 }, 5, reelDurationSec(undefined));
  expect(items.map((i) => i.start)).toEqual(
    reelPlan(toc, { count: 7, len: 30 }, 5).map((i) => i.start),
  );
  expect(items.every((i) => i.start > 0 || i.end > 30)).toBe(true);
});
