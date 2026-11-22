import type { Bucket } from "./chart";

export const TOC_MAX = 10;
export const TOC_MIN_COUNT = 3;
export const TOC_MERGE_SEC = 120;

export type TocEntry = { startSec: number; count: number };

/** 30秒ごとの区間から盛り上がりの山を拾う（docs/specs/51-toc.md）。数の多い順、同数は早い順。 */
export function pickPeaks(buckets: Bucket[]): TocEntry[] {
  if (buckets.length === 0) return [];
  const mean = buckets.reduce((s, b) => s + b.count, 0) / buckets.length;
  const peaks = buckets.filter((b, i) => {
    if (b.count <= mean || b.count < TOC_MIN_COUNT) return false;
    const prev = buckets[i - 1];
    const next = buckets[i + 1];
    // 同数が続くときは最初の1つだけ
    return (!prev || prev.count < b.count) && (!next || next.count <= b.count);
  });
  peaks.sort((a, b) => b.count - a.count || a.startSec - b.startSec);
  const out: TocEntry[] = [];
  for (const p of peaks) {
    if (out.some((o) => Math.abs(o.startSec - p.startSec) < TOC_MERGE_SEC)) continue;
    out.push({ startSec: p.startSec, count: p.count });
    if (out.length === TOC_MAX) break;
  }
  return out;
}

/** 再生位置にいちばん近い山の番号（同じ近さなら先）。山がないなら -1。 */
export function nearestIndex(entries: TocEntry[], sec: number): number {
  let best = -1;
  let dist = Number.POSITIVE_INFINITY;
  entries.forEach((e, i) => {
    const d = Math.abs(e.startSec - sec);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}
