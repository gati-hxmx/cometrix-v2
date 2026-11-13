/** 拡大中の最小の幅（30秒の区間の数。10 区間＝5分）。 */
export const MIN_RANGE = 10;

/** 表示範囲（元の区間の番号。start 以上 end 未満）。 */
export type Range = { start: number; end: number };

/** 範囲を 0〜total に収める。幅は MIN_RANGE（全体がそれより短ければ全体）以上 total 以下。 */
export function clampRange(r: Range, total: number): Range {
  if (total <= 0) return { start: 0, end: 0 };
  const minW = Math.min(MIN_RANGE, total);
  const width = Math.min(total, Math.max(minW, r.end - r.start));
  const start = Math.min(total - width, Math.max(0, r.start));
  return { start, end: start + width };
}

/** anchor（0〜1、表示範囲の左端からの割合）の下の位置を動かさずに、幅を factor 倍にする（<1 で拡大）。 */
export function zoomRange(r: Range, total: number, anchor: number, factor: number): Range {
  const a = Math.min(1, Math.max(0, anchor));
  const width = r.end - r.start;
  const nextW = Math.min(total, Math.max(Math.min(MIN_RANGE, total), width * factor));
  const point = r.start + width * a;
  const start = point - nextW * a;
  return clampRange({ start, end: start + nextW }, total);
}

/** 小数の範囲を、区間の番号として使える整数の範囲にそろえる（幅は保ち、0〜total に収める）。 */
export function snapRange(r: Range, total: number): Range {
  const c = clampRange(r, total);
  const width = Math.round(c.end - c.start);
  const start = Math.min(total - width, Math.max(0, Math.round(c.start)));
  return { start, end: start + width };
}

/** 範囲を delta 区間だけ横に動かす（端で止まる。幅は変えない）。 */
export function panRange(r: Range, total: number, delta: number): Range {
  return clampRange({ start: r.start + delta, end: r.end + delta }, total);
}

/** index の区間が見えるように、範囲を最小限だけ動かす。 */
export function revealIndex(r: Range, total: number, index: number): Range {
  if (index < r.start) return panRange(r, total, index - r.start);
  if (index >= r.end) return panRange(r, total, index - r.end + 1);
  return r;
}

const TIME_STEPS = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];

/** 横軸の時刻ラベル（「0:00:00」で約 48px）が隣と接しないよう、描画幅から目盛りの最大本数を決める。PC は最大 10 本。 */
export function maxTickCount(widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 10;
  return Math.max(2, Math.min(10, Math.floor(widthPx / 80)));
}

/** from〜to 秒の範囲に、最大 maxCount 本の時刻の目盛り（間隔の倍数）を返す。 */
export function timeTicks(fromSec: number, toSec: number, maxCount = 10): number[] {
  const span = toSec - fromSec;
  if (span <= 0) return [];
  const step = TIME_STEPS.find((s) => Math.floor(span / s) + 1 <= maxCount) ?? 86400;
  const ticks: number[] = [];
  for (let t = Math.ceil(fromSec / step) * step; t <= toSec; t += step) ticks.push(t);
  return ticks;
}

/** 縦軸の目盛り。0 から max を覆うきりのいい数まで（0 を含む、おおむね 3〜5 本）。 */
export function valueTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = Math.max(1, 10 ** Math.floor(Math.log10(raw))); // コメント数は整数
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; ; v += step) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}
