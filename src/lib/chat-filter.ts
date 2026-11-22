import { BUCKET_SECONDS, type Bucket } from "./buckets";

export const MAX_TERM = 100;
export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 100;

export const MAX_TERMS = 10;

/**
 * 6種類の絞り込み。含める同士は OR、除外は優先、ワード・ユーザー・正規表現は AND。
 * 語は正規化済み。re・xre は本文に当てる正規表現（大文字小文字を区別しない部分一致）で、小文字にしない。
 */
export type Filter = {
  q: string[];
  xq: string[];
  user: string[];
  xuser: string[];
  re: string[];
  xre: string[];
};
export const EMPTY_FILTER: Filter = { q: [], xq: [], user: [], xuser: [], re: [], xre: [] };
export const FILTER_KEYS = ["q", "xq", "user", "xuser", "re", "xre"] as const;
export const REGEX_KEYS = ["re", "xre"] as const;

/** 正規表現として読めるか（JS の RegExp で検査する。DB 側が読めないときは API が 400 にする）。 */
export function compileRegex(s: string): RegExp | null {
  try {
    return new RegExp(s, "i");
  } catch {
    return null;
  }
}

/** 正規表現を整える：前後の空白を除くだけで、小文字にはしない（\S・\D などの意味が変わるため）。 */
function normalizeRegex(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/** 正規表現を1つ足せるか。空・重複・上限・長すぎ・読めない形は理由つきで断る。 */
export function addRegex(
  list: string[],
  raw: string,
):
  | { ok: true; list: string[] }
  | { ok: false; reason: "empty" | "duplicate" | "full" | "long" | "invalid" } {
  if (raw.trim().length > MAX_TERM) return { ok: false, reason: "long" };
  const t = normalizeRegex(raw);
  if (t === null) return { ok: false, reason: "empty" };
  if (list.includes(t)) return { ok: false, reason: "duplicate" };
  if (list.length >= MAX_TERMS) return { ok: false, reason: "full" };
  if (compileRegex(t) === null) return { ok: false, reason: "invalid" };
  return { ok: true, list: [...list, t] };
}

/** 絞り込み語を整える：前後の空白を除き、小文字にする。空なら null（絞り込まない）。 */
export function normalizeTerm(s: string): string | null {
  const t = s.trim().toLowerCase();
  return t === "" ? null : t;
}

/** 絞り込み中か（どれか1つでも語がある）。 */
export function isFiltering(f: Filter): boolean {
  return FILTER_KEYS.some((k) => f[k].length > 0);
}

/** 語を1つ足せるか。空・重複・上限・長すぎは理由つきで断る。 */
export function addTerm(
  list: string[],
  raw: string,
): { ok: true; list: string[] } | { ok: false; reason: "empty" | "duplicate" | "full" | "long" } {
  if (raw.trim().length > MAX_TERM) return { ok: false, reason: "long" };
  const t = normalizeTerm(raw);
  if (t === null) return { ok: false, reason: "empty" };
  if (list.includes(t)) return { ok: false, reason: "duplicate" };
  if (list.length >= MAX_TERMS) return { ok: false, reason: "full" };
  return { ok: true, list: [...list, t] };
}

/** コメントが絞り込みに合うか（DB 側も同じ規則で strpos を使う）。 */
export function matches(m: { author: string; body: string }, f: Filter): boolean {
  const body = m.body.toLowerCase();
  const author = m.author.toLowerCase();
  const hit = (t: string) => compileRegex(t)?.test(m.body) ?? false;
  if (f.xq.some((t) => body.includes(t))) return false;
  if (f.xuser.some((t) => author.includes(t))) return false;
  if (f.xre.some(hit)) return false;
  if (f.q.length > 0 && !f.q.some((t) => body.includes(t))) return false;
  if (f.user.length > 0 && !f.user.some((t) => author.includes(t))) return false;
  if (f.re.length > 0 && !f.re.some(hit)) return false;
  return true;
}

export type ParsedQuery = { ok: true; filter: Filter } | { ok: false };

/** q・xq・user・xuser・re・xre（それぞれ繰り返し可）を読む。空の値は無視、重複は1つにまとめる。100 文字超・11語以上は不正。 */
export function parseFilter(params: URLSearchParams): ParsedQuery {
  const out: Filter = { q: [], xq: [], user: [], xuser: [], re: [], xre: [] };
  for (const k of FILTER_KEYS) {
    const isRe = k === "re" || k === "xre";
    for (const raw of params.getAll(k)) {
      if (raw.trim().length > MAX_TERM) return { ok: false };
      const t = isRe ? normalizeRegex(raw) : normalizeTerm(raw);
      if (t !== null && isRe && compileRegex(t) === null) return { ok: false };
      if (t !== null && !out[k].includes(t)) out[k].push(t);
    }
    if (out[k].length > MAX_TERMS) return { ok: false };
  }
  return { ok: true, filter: out };
}

/** 画面から API へ渡すクエリ。 */
export function filterParams(f: Filter): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) for (const t of f[k]) p.append(k, t);
  return p;
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
