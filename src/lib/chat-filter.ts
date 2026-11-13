import { BUCKET_SECONDS, type Bucket } from "./buckets";

export const MAX_TERM = 100;
export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 100;

/** 絞り込み語を整える：前後の空白を除き、小文字にする。空なら null（絞り込まない）。 */
export function normalizeTerm(s: string): string | null {
  const t = s.trim().toLowerCase();
  return t === "" ? null : t;
}

/** コメントが絞り込みに合うか（DB 側も同じ規則で strpos を使う）。 */
export function matches(
  m: { author: string; body: string },
  f: { q: string | null; user: string | null },
): boolean {
  if (f.q !== null && !m.body.toLowerCase().includes(f.q)) return false;
  if (f.user !== null && !m.author.toLowerCase().includes(f.user)) return false;
  return true;
}

export type ParsedQuery = { ok: true; q: string | null; user: string | null } | { ok: false };

/** q・user を読む。100 文字を超えると不正。 */
export function parseFilter(params: URLSearchParams): ParsedQuery {
  const q = params.get("q") ?? "";
  const user = params.get("user") ?? "";
  if (q.trim().length > MAX_TERM || user.trim().length > MAX_TERM) return { ok: false };
  return { ok: true, q: normalizeTerm(q), user: normalizeTerm(user) };
}

/** 0 以上の整数（未指定・空は既定値）。数でない・負・小数は null。 */
export function parseIntParam(v: string | null, fallback: number): number | null {
  if (v === null || v === "") return fallback;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/** 0 秒から lastStartSec まで、0 件の区間も含めて連続にそろえる。 */
export function fillBuckets(rows: Bucket[], lastStartSec: number): Bucket[] {
  const by = new Map(rows.map((r) => [r.startSec, r.count]));
  const out: Bucket[] = [];
  for (let s = 0; s <= lastStartSec; s += BUCKET_SECONDS)
    out.push({ startSec: s, count: by.get(s) ?? 0 });
  return out;
}

/** 時刻の昇順の配列から、sec に最も近い位置。空なら -1。 */
export function nearestIndex(offsetsMs: number[], sec: number): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  const ms = sec * 1000;
  offsetsMs.forEach((o, i) => {
    const d = Math.abs(o - ms);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
