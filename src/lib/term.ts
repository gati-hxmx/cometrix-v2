import { MAX_TERM } from "./chat-filter";

/** グラフに重ねる言葉の最大数（#53）。 */
export const MAX_LINES = 2;

/** 前後から除く空白（半角スペース・タブ・改行・全角スペース）。 */
const edges = /^[ \t\r\n　]+|[ \t\r\n　]+$/g;

/** 言葉・コメントの比べ方をそろえる：NFKC にして小文字にする（全角半角・大文字小文字を区別しない）。 */
export function foldText(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** 言葉を整える（前後の空白を除き、foldText にする）。空・長すぎは null。 */
export function normalizeKeyword(raw: string): string | null {
  const t = raw.replace(edges, "");
  if (t === "" || t.length > MAX_TERM) return null;
  const f = foldText(t).replace(edges, "");
  return f === "" ? null : f;
}

/** コメントが言葉を含むか（term は normalizeKeyword 済み）。1つのコメントに何回あっても1件。 */
export function hasTerm(body: string, term: string): boolean {
  return foldText(body).includes(term);
}

/** 言葉を1つ足せるか。空・長すぎ・重複・上限は理由つきで断る。 */
export function addKeyword(
  list: string[],
  raw: string,
): { ok: true; list: string[] } | { ok: false; reason: "empty" | "long" | "duplicate" | "full" } {
  if (raw.replace(edges, "").length > MAX_TERM) return { ok: false, reason: "long" };
  const t = normalizeKeyword(raw);
  if (t === null) return { ok: false, reason: "empty" };
  if (list.includes(t)) return { ok: false, reason: "duplicate" };
  if (list.length >= MAX_LINES) return { ok: false, reason: "full" };
  return { ok: true, list: [...list, t] };
}
