import {
  compileRegex,
  EMPTY_FILTER,
  FILTER_KEYS,
  type Filter,
  MAX_TERM,
  MAX_TERMS,
  REGEX_KEYS,
} from "./chat-filter";
import { MAX_LINES } from "./term";

// よく使う絞り込みを名前を付けて保存し、次の配信でもチップで呼び出す（#67）。
// 保存はこのブラウザ（localStorage）。ログインができたらアカウントへ移す（D3）。

export const SAVED_KEY = "cometrix-saved-filters";
export const MAX_SAVED = 20;
export const MAX_NAME = 30;

/** 保存した絞り込み。filter はチャットの絞り込み、terms はグラフに重ねる言葉（B3）。 */
export type Saved = { name: string; filter: Filter; terms: string[] };

/** 名前などの長さは見た目の文字数（絵文字も1文字）で数える。 */
export const charCount = (s: string) => Array.from(s).length;

const strings = (v: unknown, max: number): string[] | null =>
  Array.isArray(v) &&
  v.length <= max &&
  v.every((s) => typeof s === "string" && charCount(s) <= MAX_TERM)
    ? (v as string[])
    : null;

/** 保存した文字列を読む。壊れた行は飛ばし、読めなければ空。 */
export function parseSaved(raw: string | null): Saved[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Saved[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (name === "" || charCount(name) > MAX_NAME) continue;
    const f = (r.filter ?? {}) as Record<string, unknown>;
    const filter = { ...EMPTY_FILTER };
    let ok = true;
    for (const k of FILTER_KEYS) {
      const list = f[k] === undefined ? [] : strings(f[k], MAX_TERMS);
      if (list === null) ok = false;
      else filter[k] = list;
    }
    // 読めない形（正規表現）が混じった行は使わない（呼び出すと絞り込みが失敗するため）
    if (ok && REGEX_KEYS.some((k) => filter[k].some((p) => compileRegex(p) === null))) ok = false;
    const terms = r.terms === undefined ? [] : strings(r.terms, MAX_LINES);
    if (!ok || terms === null || out.some((s) => s.name === name)) continue;
    out.push({ name, filter, terms });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

const isEmpty = (filter: Filter, terms: string[]) =>
  terms.length === 0 && FILTER_KEYS.every((k) => filter[k].length === 0);

/** 名前の候補：使っている語を「・」でつなぐ（長ければ切る）。 */
export function defaultName(filter: Filter, terms: string[]): string {
  const words = [...filter.q, ...terms, ...filter.user, ...filter.re];
  const extra = [...filter.xq.map((w) => `除外 ${w}`), ...filter.xuser.map((u) => `除外 ${u}`)];
  const joined = [...new Set([...words, ...extra])].join("・");
  if (joined === "") return "";
  return Array.from(joined).length > MAX_NAME
    ? `${Array.from(joined)
        .slice(0, MAX_NAME - 1)
        .join("")}…`
    : joined;
}

export type SaveReason = "empty" | "long" | "nothing" | "full";

/** 今の絞り込みを保存する。同じ名前があれば中身を入れ替える（並びはそのまま）。 */
export function saveFilter(
  list: Saved[],
  rawName: string,
  filter: Filter,
  terms: string[],
):
  | { ok: true; list: Saved[]; replaced: Saved | null; index: number }
  | { ok: false; reason: SaveReason } {
  const name = rawName.trim();
  if (name === "") return { ok: false, reason: "empty" };
  if (charCount(name) > MAX_NAME) return { ok: false, reason: "long" };
  if (isEmpty(filter, terms)) return { ok: false, reason: "nothing" };
  const item: Saved = { name, filter: cloneFilter(filter), terms: [...terms] };
  const at = list.findIndex((s) => s.name === name);
  if (at >= 0)
    return {
      ok: true,
      replaced: list[at],
      index: at,
      list: list.map((s, i) => (i === at ? item : s)),
    };
  if (list.length >= MAX_SAVED) return { ok: false, reason: "full" };
  return { ok: true, replaced: null, index: list.length, list: [...list, item] };
}

/** 消す。［元に戻す］のために、消したものと元の位置を返す。 */
export function removeSaved(
  list: Saved[],
  name: string,
): { list: Saved[]; removed: Saved | null; index: number } {
  const index = list.findIndex((s) => s.name === name);
  if (index < 0) return { list, removed: null, index: -1 };
  return { list: list.filter((_, i) => i !== index), removed: list[index], index };
}

/** 上書きしたものを元に戻す（名前が同じものを入れ替える。なければ元の位置に足す）。 */
export function undoOverwrite(list: Saved[], previous: Saved, index: number): Saved[] {
  return list.some((s) => s.name === previous.name)
    ? list.map((s) => (s.name === previous.name ? previous : s))
    : restoreSaved(list, previous, index);
}

/** 消したものを元の位置に戻す（その間に同じ名前で保存されていたら、そちらを残す）。 */
export function restoreSaved(list: Saved[], item: Saved, index: number): Saved[] {
  if (list.some((s) => s.name === item.name)) return list;
  const out = [...list];
  out.splice(Math.min(Math.max(0, index), out.length), 0, item);
  return out.slice(0, MAX_SAVED);
}

/** 今の絞り込みが、保存したものと同じか（チップを選んだ状態にする）。並びは問わない。 */
export function sameAs(s: Saved, filter: Filter, terms: string[]): boolean {
  const eq = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
  return eq(s.terms, terms) && FILTER_KEYS.every((k) => eq(s.filter[k], filter[k]));
}

function cloneFilter(f: Filter): Filter {
  const out = { ...EMPTY_FILTER };
  for (const k of FILTER_KEYS) out[k] = [...f[k]];
  return out;
}
