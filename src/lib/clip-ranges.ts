export const CLIP_MAX = 50;
export const CLIP_NAME_MAX = 40;
export const clipsKey = (id: string) => `cometrix:clips:${id}`;

export type Clip = { id: string; name: string; start: number; end: number };

/** 「m:ss」「h:mm:ss」を秒に。形が違えば null。 */
export function parseClock(text: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,3}):([0-5]\d)$/.exec(text.trim());
  if (!m) return null;
  const h = m[1] === undefined ? 0 : Number(m[1]);
  const min = Number(m[2]);
  if (m[1] !== undefined && min > 59) return null;
  return h * 3600 + min * 60 + Number(m[3]);
}

/** 秒を「m:ss」（1時間以上は「h:mm:ss」）に。 */
export function formatClock(sec: number): string {
  const t = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 始点・終点の確かめ。問題なければ null、あれば画面に出す理由。 */
export function rangeError(start: number | null, end: number | null): string | null {
  if (start === null || end === null) return "時刻は 1:23 か 1:02:03 の形で入れてください";
  if (end <= start) return "終点は始点より後にしてください";
  return null;
}

/** 範囲を 0〜max（max が 0 以下なら上限なし）に丸め、始点・終点を小さい順にそろえる。 */
export function normalizeRange(a: number, b: number, max: number): { start: number; end: number } {
  const cap = (x: number) => {
    const v = Math.max(0, Math.floor(x));
    return max > 0 ? Math.min(v, max) : v;
  };
  const [x, y] = [cap(a), cap(b)];
  return { start: Math.min(x, y), end: Math.max(x, y) };
}

const byStart = (a: Clip, b: Clip) => a.start - b.start || a.end - b.end;

export function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort(byStart);
}

export function addClip(clips: Clip[], clip: Clip): Clip[] | null {
  if (clips.length >= CLIP_MAX) return null;
  return sortClips([...clips, { ...clip, name: clip.name.slice(0, CLIP_NAME_MAX) }]);
}

export function updateClip(clips: Clip[], id: string, patch: Partial<Omit<Clip, "id">>): Clip[] {
  return sortClips(
    clips.map((c) =>
      c.id === id ? { ...c, ...patch, name: (patch.name ?? c.name).slice(0, CLIP_NAME_MAX) } : c,
    ),
  );
}

export function removeClip(clips: Clip[], id: string): Clip[] {
  return clips.filter((c) => c.id !== id);
}

/** 名前が空のときの表示名。一覧の並び（1 始まり）で付ける。 */
export function clipLabel(clip: Clip, index: number): string {
  return clip.name.trim() === "" ? `範囲 ${index + 1}` : clip.name;
}

/** 保存した文字列を読む。壊れた値・形の違う要素は捨てる。 */
export function parseClips(raw: string | null): Clip[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Clip[] = [];
  const seen = new Set<string>();
  for (const x of data) {
    if (typeof x !== "object" || x === null) continue;
    const c = x as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      typeof c.name !== "string" ||
      typeof c.start !== "number" ||
      typeof c.end !== "number" ||
      !Number.isFinite(c.start) ||
      !Number.isFinite(c.end) ||
      c.start < 0 ||
      c.end <= c.start ||
      seen.has(c.id)
    )
      continue;
    seen.add(c.id);
    out.push({ id: c.id, name: c.name.slice(0, CLIP_NAME_MAX), start: c.start, end: c.end });
    if (out.length >= CLIP_MAX) break;
  }
  return sortClips(out);
}

export const serializeClips = (clips: Clip[]): string => JSON.stringify(clips);
