import { leadTarget } from "./lead";
import type { TocEntry } from "./toc";

/**
 * 見どころを続けて再生（#61、docs/screens/analysis.md「見どころ再生」）。
 * 目次の上位の山を、目次の順（数の多い順）に、山の少し前から決まった秒数ずつ再生する。
 */

/** 選べる見どころの数。0 は「全部」（目次に出る山すべて）。 */
export const REEL_COUNTS = [5, 7, 0] as const;
/** 選べる1つの長さ（秒） */
export const REEL_LENS = [20, 30, 60] as const;
export type ReelCount = (typeof REEL_COUNTS)[number];
export type ReelLen = (typeof REEL_LENS)[number];
export type ReelSettings = { count: ReelCount; len: ReelLen };
export const REEL_DEFAULT: ReelSettings = { count: 7, len: 30 };
/** 保存先（localStorage）。中身は "7-30" の形。 */
export const REEL_KEY = "cometrix-reel";

/** 自分で動かした直後は、プレイヤーの時刻がまだ前の位置を返すことがあるので、この間は外れを見ない。 */
export const REEL_GRACE_MS = 2000;
/** 再生中の範囲から、この秒数より外へ出たら「自分で動かした」とみなして止める。 */
export const REEL_LEAVE_SEC = 3;

export type ReelItem = {
  /** 目次での番号（0 から） */
  n: number;
  /** 山の区間の開始（グラフの番号の位置） */
  peakSec: number;
  /** 再生する範囲 */
  start: number;
  end: number;
};

/** 保存された文字を設定に戻す。壊れた値は初期値。 */
export function parseReel(v: string | null | undefined): ReelSettings {
  const m = /^(\d+)-(\d+)$/.exec(v ?? "");
  if (!m) return REEL_DEFAULT;
  const count = REEL_COUNTS.find((c) => c === Number(m[1]));
  const len = REEL_LENS.find((l) => l === Number(m[2]));
  return count === undefined || len === undefined ? REEL_DEFAULT : { count, len };
}

export function reelKeyValue(s: ReelSettings): string {
  return `${s.count}-${s.len}`;
}

/** 目次の山から、再生する並びを作る。範囲が前の範囲と重なっても、そのまま並べる（山ごとに少し前から見る）。 */
export function reelPlan(entries: TocEntry[], s: ReelSettings, lead: number): ReelItem[] {
  const picked = s.count === 0 ? entries : entries.slice(0, s.count);
  return picked.map((e, n) => {
    const start = leadTarget(e.startSec, lead);
    return { n, peakSec: e.startSec, start, end: start + s.len };
  });
}

/** 合計の長さ（秒） */
export function reelTotalSec(entries: TocEntry[], s: ReelSettings): number {
  const n = s.count === 0 ? entries.length : Math.min(entries.length, s.count);
  return n * s.len;
}

/** 「約 3 分 30 秒」のような合計の長さの言い方 */
export function reelTotalText(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (m === 0) return `約 ${r} 秒`;
  return r === 0 ? `約 ${m} 分` : `約 ${m} 分 ${r} 秒`;
}

/** 設定のボタンの文字（「上位 7・30 秒」「全部・20 秒」） */
export function reelSettingText(s: ReelSettings): string {
  return `${s.count === 0 ? "全部" : `上位 ${s.count}`}・${s.len} 秒`;
}

export type ReelStep =
  | { kind: "stay"; remain: number }
  | { kind: "next"; index: number }
  | { kind: "done" }
  | { kind: "left" };

/**
 * 今の再生位置から、次にすること。
 * - 範囲の終わりまで来たら次へ（最後なら終わり）
 * - 範囲から外れたら（動画やグラフ・チャットで自分で動かした）止める。動かした直後の graceMs は見ない
 */
export function reelStep(
  items: ReelItem[],
  index: number,
  now: number,
  sinceSeekMs: number,
): ReelStep {
  const it = items[index];
  if (!it) return { kind: "done" };
  const settled = sinceSeekMs >= REEL_GRACE_MS;
  if (settled && (now < it.start - REEL_LEAVE_SEC || now > it.end + REEL_LEAVE_SEC))
    return { kind: "left" };
  if (now >= it.end) {
    // 動かした直後に前の位置（範囲の後ろ）が返ってきても、次へ進めない
    if (!settled && now > it.end + REEL_LEAVE_SEC)
      return { kind: "stay", remain: it.end - it.start };
    return index + 1 < items.length ? { kind: "next", index: index + 1 } : { kind: "done" };
  }
  return { kind: "stay", remain: Math.max(0, Math.ceil(it.end - Math.max(now, it.start))) };
}

/**
 * グラフの下の番号の札を、重ならないように置く（左から順に、空いている最初の段へ）。
 * どの段も空いていなければ、いちばん左が空いている段で、前の札のすぐ右へずらす。
 * xs は札の中心の位置（px）。返り値は段の番号と、置く位置（px）。
 */
export function stripLayout(xs: number[], gap: number, maxRows = 2): { row: number; x: number }[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const last: number[] = [];
  const out = xs.map((x) => ({ row: 0, x }));
  for (const { x, i } of order) {
    let r = last.findIndex((l) => x - l >= gap);
    let at = x;
    if (r === -1) {
      if (last.length < maxRows) r = last.length;
      else {
        r = last.indexOf(Math.min(...last));
        at = last[r] + gap;
      }
    }
    last[r] = at;
    out[i] = { row: r, x: at };
  }
  return out;
}
