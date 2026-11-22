/**
 * スパム（連投・長いコピペ）の判定（#56）。DB（chat-sql.ts の spamFreeSource）と同じ規則を JS でも書き、
 * 見本でそろいをテストする。
 *
 * 数えないもの：
 * - 同じ投稿者が、同じ文（前後の空白を除き小文字にしたもの）を、その人の直前の同じ文から
 *   SPAM_WINDOW_MS 未満で投稿したときの2回目以降（連鎖：直前が数えない側でも続く）。
 * - 前後の空白を除いた本文が SPAM_LONG 文字以上のコメント。
 */
export const SPAM_WINDOW_MS = 30_000;
export const SPAM_LONG = 100;

/** 前後から除く空白：半角スペース・タブ・改行・全角スペース（laugh.ts と同じ）。DB の btrim にも渡す。 */
export const SPAM_TRIM = " \t\r\n　";

const edges = /^[ \t\r\n　]+|[ \t\r\n　]+$/g;

type Msg = { offsetMs: number; author: string; body: string };

/** 数えるコメントだけを返す（動画開始前は除く。時刻→入力順で見る）。 */
export function dropSpam<T extends Msg>(messages: T[]): T[] {
  const sorted = messages
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.offsetMs >= 0)
    .sort((a, b) => a.m.offsetMs - b.m.offsetMs || a.i - b.i);
  const last = new Map<string, number>();
  const kept: { m: T; i: number }[] = [];
  for (const e of sorted) {
    const text = e.m.body.replace(edges, "");
    const key = JSON.stringify([e.m.author, text.toLowerCase()]);
    const prev = last.get(key);
    last.set(key, e.m.offsetMs);
    const repeat = prev !== undefined && e.m.offsetMs - prev < SPAM_WINDOW_MS;
    if (!repeat && text.length < SPAM_LONG) kept.push(e);
  }
  return kept.sort((a, b) => a.i - b.i).map((e) => e.m);
}
