/**
 * コラボを重ねて比べる（#63、案 J、docs/screens/compare.md）の計算。
 * 2〜4 本の配信を、配信した時刻（result.streamedAt）で同じ時間軸にそろえ、30 秒ごとの数を重ねる。
 */

export const COMPARE_MAX = 4;
export const COMPARE_MIN = 2;
/** 手で直せる幅（1 本あたり ±1 時間）。1 回押すと 1 秒 */
export const ADJ_LIMIT = 3600;
const BUCKET = 30;
/** 盛り上がった区間：その配信の 30 秒ごとの数の上位 15%（85 パーセンタイル以上） */
export const HOT_QUANTILE = 0.85;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CompareParams = { ids: string[]; adj: number[] };

/** URL の ?ids=a,b&adj=0,3 を読む。正しくない id は捨て、重なりは1つに、4 本まで。adj は id と同じ並び。 */
export function parseCompare(params: URLSearchParams): CompareParams {
  const rawIds = (params.get("ids") ?? "").split(",");
  const rawAdj = (params.get("adj") ?? "").split(",");
  const ids: string[] = [];
  const adj: number[] = [];
  rawIds.forEach((raw, i) => {
    const id = raw.trim().toLowerCase();
    if (!UUID.test(id) || ids.includes(id) || ids.length >= COMPARE_MAX) return;
    ids.push(id);
    adj.push(clampAdj(Number(rawAdj[i] ?? 0)));
  });
  return { ids, adj };
}

export function clampAdj(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-ADJ_LIMIT, Math.min(ADJ_LIMIT, Math.round(n)));
}

/** parseCompare の逆。直していなければ adj を付けない */
export function compareQuery({ ids, adj }: CompareParams): string {
  const p = new URLSearchParams();
  p.set("ids", ids.join(","));
  if (adj.some((a) => a !== 0)) p.set("adj", adj.map((a) => a || 0).join(","));
  return p.toString().replace(/%2C/g, ",");
}

/**
 * 各配信が、共通の時間軸の何秒目に始まったか。最初に始まった配信を 0 にする。
 * streamedAt がわからない配信は、いちばん早い配信と同じ時刻に始まったことにする（unknown で知らせる）。
 */
export function alignShifts(
  streamedAt: (number | null | undefined)[],
  adj: number[],
): { shifts: number[]; unknown: boolean[] } {
  const unknown = streamedAt.map((s) => typeof s !== "number" || !Number.isFinite(s));
  const known = streamedAt.filter((_, i) => !unknown[i]) as number[];
  const base = known.length > 0 ? Math.min(...known) : 0;
  const raw = streamedAt.map((s, i) => (unknown[i] ? 0 : (s as number) - base) + (adj[i] ?? 0));
  const min = raw.length > 0 ? Math.min(...raw) : 0;
  return { shifts: raw.map((r) => r - min), unknown };
}

/** 「基準」「+0:12」「−0:41」「+1:02:03」 */
export function formatShift(sec: number): string {
  if (sec === 0) return "基準";
  const a = Math.abs(Math.round(sec));
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = String(a % 60).padStart(2, "0");
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  return `${sec > 0 ? "+" : "−"}${body}`;
}

/**
 * 配信の 30 秒ごとの数（動画の 0 秒から）を、shift 秒あとに始まったものとして共通の時間軸の n 区間に置き直す。
 * 30 秒の倍数でないずれは、重なった長さの割合で分ける。配信していない区間は null（線を引かない）。
 */
export function shiftCounts(counts: number[], shift: number, n: number): (number | null)[] {
  const len = counts.length * BUCKET;
  const out: (number | null)[] = [];
  for (let k = 0; k < n; k++) {
    const from = k * BUCKET - shift;
    const to = from + BUCKET;
    if (to <= 0 || from >= len) {
      out.push(null);
      continue;
    }
    let v = 0;
    const first = Math.max(0, Math.floor(from / BUCKET));
    const last = Math.min(counts.length - 1, Math.floor((to - 1e-9) / BUCKET));
    for (let i = first; i <= last; i++) {
      const overlap = Math.min(to, (i + 1) * BUCKET) - Math.max(from, i * BUCKET);
      if (overlap > 0) v += (counts[i] * overlap) / BUCKET;
    }
    out.push(v);
  }
  return out;
}

/** 共通の時間軸の区間の数（いちばん遅く終わる配信まで） */
export function axisLength(lengths: number[], shifts: number[]): number {
  let end = 0;
  lengths.forEach((l, i) => {
    end = Math.max(end, (shifts[i] ?? 0) + l * BUCKET);
  });
  return Math.ceil(end / BUCKET);
}

/** null を除いた値の q 分位（小さい順に並べて floor(len × q) 番目） */
export function quantile(values: (number | null)[], q: number): number {
  const xs = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (xs.length === 0) return Number.POSITIVE_INFINITY;
  return xs[Math.min(xs.length - 1, Math.floor(xs.length * q))];
}

/** 一緒に盛り上がったと見なす本数。2 本なら 2 本、3 本以上なら 3 本 */
export function togetherNeed(n: number): number {
  return Math.min(3, n);
}

/**
 * 区間ごとに、各配信が自分の上位 15% に入っているかを数え、need 本以上なら true。
 * 0 件と、中央値以下（ずっと同じ数の配信で全部が「上位」にならないように）は入れない。
 */
export function togetherBands(series: (number | null)[][], need = togetherNeed(series.length)) {
  const thresholds = series.map((s) => quantile(s, HOT_QUANTILE));
  const medians = series.map((s) => quantile(s, 0.5));
  const n = Math.max(0, ...series.map((s) => s.length));
  const out: boolean[] = [];
  for (let k = 0; k < n; k++) {
    let hot = 0;
    series.forEach((s, j) => {
      const v = s[k];
      if (v !== null && v !== undefined && v > 0 && v >= thresholds[j] && v > medians[j]) hot++;
    });
    out.push(series.length >= 2 && hot >= need);
  }
  return out;
}

/** 帯（true が続く所）を [始まり, 終わり) の区間の番号にまとめる */
export function bandRuns(bands: boolean[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  bands.forEach((on, k) => {
    if (!on) return;
    const last = runs[runs.length - 1];
    if (last && last.end === k) last.end = k + 1;
    else runs.push({ start: k, end: k + 1 });
  });
  return runs;
}

/** 割合の表示：各配信の最大を 100 とする */
export function normalize(series: (number | null)[]): (number | null)[] {
  const max = Math.max(0, ...series.filter((v): v is number => v !== null));
  return series.map((v) => (v === null ? null : max > 0 ? (v / max) * 100 : 0));
}

/**
 * 共通の時間軸の sec 秒から始まる 30 秒は、shift 秒あとに始まった配信の動画の何秒目か。
 * 区間の途中で配信が始まったときは動画の 0 秒（線と札に数が出ている区間は押せば再生できる）。重ならなければ null
 */
export function videoSecAt(sec: number, shift: number, lengthSec: number): number | null {
  const t = sec - shift;
  if (t + BUCKET <= 0 || t >= lengthSec) return null;
  return Math.max(0, t);
}

/** 札や小窓に出す値。件数は四捨五入、割合は「%」 */
export function valueText(v: number | null, ratio: boolean): string {
  if (v === null) return "—";
  return ratio ? `${Math.round(v)}%` : `${Math.round(v).toLocaleString("ja-JP")} 件`;
}
