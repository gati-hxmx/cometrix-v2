// 共有リンクの URL と、時刻つきで開くときの t（秒）。ブラウザでもサーバーでも使う（#68）。

/** /s/<鍵>。t があれば ?t=秒 を付ける */
export function sharePath(token: string, t?: number): string {
  return t && t > 0 ? `/s/${token}?t=${Math.floor(t)}` : `/s/${token}`;
}

/** ?t= の値を秒にする。「90」「1m30s」「1h2m3s」を読み、読めなければ null。 */
export function parseStartSec(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  if (/^\d{1,6}$/.test(s)) return Number(s);
  const m = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,5})s)?$/.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
