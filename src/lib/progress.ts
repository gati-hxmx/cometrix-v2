import { formatTime } from "./chart";

/**
 * 取得中の進み具合（#43）。ジョブが running のあいだだけ、jobs.result に { progress } として置く。
 * stage は fetching（チャットを取得中）か saving（取得が終わって集計・保存中）。
 */
export type FetchProgress = {
  stage: "fetching" | "saving";
  /** 取得済みのコメントのうち、いちばん後ろの時刻（動画の先頭からの秒）。 */
  fetchedSec: number;
  /** 配信の長さ（秒）。分からないときは null で、％ は出さない。 */
  durationSec: number | null;
};

/** yt-dlp の live_chat.json（1行1JSON）の末尾の断片から、最後のコメントの時刻（秒）を読む。 */
export function lastOffsetSec(tail: string): number | null {
  let last: string | null = null;
  for (const m of tail.matchAll(/"videoOffsetTimeMsec":\s*"(\d+)"/g)) last = m[1];
  return last === null ? null : Math.floor(Number(last) / 1000);
}

/** yt-dlp の --print duration の出力（秒。分からないと "NA"）を数にする。 */
export function parseDuration(s: string | undefined): number | null {
  const n = Number(s?.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** 0〜100 の ％。長さが分からないときは null。取得中は 99 で止め、100 は完了だけにする。 */
export function progressPercent(p: FetchProgress): number | null {
  if (!p.durationSec) return null;
  if (p.stage === "saving") return 100;
  return Math.min(99, Math.max(0, Math.floor((p.fetchedSec / p.durationSec) * 100)));
}

/** 画面に出す1行。例「42%（1:23:45 / 6:40:37 まで取得）」。 */
export function progressLabel(p: FetchProgress): string {
  if (p.stage === "saving") return "取得が終わりました。集計して保存しています";
  const pct = progressPercent(p);
  if (pct === null) return `${formatTime(p.fetchedSec)} まで取得`;
  return `${pct}%（${formatTime(p.fetchedSec)} / ${formatTime(p.durationSec ?? 0)} まで取得）`;
}

/** jobs.result に置いた値から進み具合を取り出す。形が違えば null。 */
export function readProgress(result: unknown): FetchProgress | null {
  const p = (result as { progress?: Partial<FetchProgress> } | null)?.progress;
  if (!p || typeof p.fetchedSec !== "number") return null;
  return {
    stage: p.stage === "saving" ? "saving" : "fetching",
    fetchedSec: p.fetchedSec,
    durationSec: typeof p.durationSec === "number" ? p.durationSec : null,
  };
}
