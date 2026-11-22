/** Twitch のクリップ1件。offsetSec は VOD の先頭からの秒。 */
export type Clip = {
  id: string;
  title: string;
  url: string;
  offsetSec: number;
  durationSec: number;
};

const SAFE_HOSTS = new Set(["clips.twitch.tv", "www.twitch.tv"]);

/** クリップのページとして開いてよい URL か（https の Twitch のページだけ）。 */
export function isSafeClipUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SAFE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** 保存された result.clips を画面で使える形にする。形が違うもの・危ない URL は捨てる。 */
export function cleanClips(raw: unknown): Clip[] {
  if (!Array.isArray(raw)) return [];
  const out: Clip[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { id, title, url, offsetSec, durationSec } = c as Record<string, unknown>;
    if (typeof id !== "string" || !isSafeClipUrl(url)) continue;
    if (typeof offsetSec !== "number" || !Number.isFinite(offsetSec) || offsetSec < 0) continue;
    out.push({
      id,
      title: typeof title === "string" ? title : "",
      url,
      offsetSec,
      durationSec: typeof durationSec === "number" && durationSec > 0 ? durationSec : 0,
    });
  }
  return out;
}
