export const MEMO_MAX = 20000;
export const memoKey = (id: string) => `cometrix:memo:${id}`;

/** 差し込む時刻の書式。1時間未満は [m:ss]、以上は [h:mm:ss]。 */
export function formatStamp(sec: number): string {
  const t = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h > 0 ? `[${h}:${String(m).padStart(2, "0")}:${ss}]` : `[${m}:${ss}]`;
}

export type MemoPart = { text: string; sec?: number };

const STAMP = /\[(?:(\d+):([0-5]\d)|(\d{1,2})):([0-5]\d)\]/g;

/** メモを、押せる時刻（sec あり）とふつうの文字に分ける。書式が不正なものは文字のまま。 */
export function splitMemo(memo: string): MemoPart[] {
  const parts: MemoPart[] = [];
  let last = 0;
  for (const m of memo.matchAll(STAMP)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: memo.slice(last, i) });
    const sec =
      m[1] !== undefined
        ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[4])
        : Number(m[3]) * 60 + Number(m[4]);
    parts.push({ text: m[0], sec });
    last = i + m[0].length;
  }
  if (last < memo.length) parts.push({ text: memo.slice(last) });
  return parts;
}

/** カーソル位置（start〜end の選択は置き換え）に stamp を入れる。null なら末尾。 */
export function insertAt(
  memo: string,
  stamp: string,
  sel: { start: number; end: number } | null,
): { text: string; caret: number } {
  const start = sel ? Math.min(sel.start, memo.length) : memo.length;
  const end = sel ? Math.min(Math.max(sel.end, start), memo.length) : memo.length;
  const text = memo.slice(0, start) + stamp + memo.slice(end);
  return { text: text.slice(0, MEMO_MAX), caret: Math.min(start + stamp.length, MEMO_MAX) };
}
