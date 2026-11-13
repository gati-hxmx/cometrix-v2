export type Bucket = { startSec: number; count: number };

/** 棒が max 本を超えるとき、連続する区間をまとめる（コメント数は合計、開始は先頭の区間）。 */
export function groupBuckets(buckets: Bucket[], max: number): Bucket[] {
  if (buckets.length <= max) return buckets;
  const size = Math.ceil(buckets.length / max);
  const out: Bucket[] = [];
  for (let i = 0; i < buckets.length; i += size) {
    const chunk = buckets.slice(i, i + size);
    out.push({ startSec: chunk[0].startSec, count: chunk.reduce((s, x) => s + x.count, 0) });
  }
  return out;
}

/** いちばん多い棒の位置（同数なら最初）。全部 0 なら -1。 */
export function peakIndex(buckets: Bucket[]): number {
  let best = -1;
  let max = 0;
  buckets.forEach((x, i) => {
    if (x.count > max) {
      max = x.count;
      best = i;
    }
  });
  return best;
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** グラフの左端から x の位置にある棒の番号（幅を棒の数で等分）。はみ出しは端の棒。棒がないなら -1。 */
export function indexAtX(x: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return -1;
  const i = Math.floor((x / width) * count);
  return Math.min(count - 1, Math.max(0, i));
}
