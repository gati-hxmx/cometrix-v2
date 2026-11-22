import { type Clip, formatClock } from "./clip-ranges";
import type { TocEntry } from "./toc";

// 分析の結果を、ほかの道具でそのまま使える形にする（#59）。動画そのものは扱わない（YouTube の規約）。

/** CSV の1つのセル。表計算ソフトで式として動かないよう、= + - @ などで始まる値は ' を前に付ける。 */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export type CsvMessage = { offsetMs: number; author: string; body: string };

export const CSV_HEADER = ["時刻", "秒", "投稿者", "コメント"] as const;

/** チャットの1行。改行は CRLF（Excel で開いたときに崩れないように）。 */
export function csvRow(m: CsvMessage): string {
  const sec = Math.floor(m.offsetMs / 1000);
  return `${[formatClock(sec), sec, m.author, m.body].map(csvCell).join(",")}\r\n`;
}

/** 先頭の行。BOM を付けて、Excel が UTF-8 として読むようにする。 */
export function csvHead(): string {
  return `\uFEFF${CSV_HEADER.join(",")}\r\n`;
}

/** YouTube のチャプターの決まり：0:00 から始まり、3つ以上、それぞれ10秒以上。 */
export const CHAPTER_MIN = 3;
export const CHAPTER_GAP_SEC = 10;

/**
 * 目次の山を、YouTube の説明欄に貼るチャプター文にする。決まりを満たせないときは null。
 * 山の数は今グラフに出している数（コメント・笑い・人数）のまま。
 */
export function chapterText(entries: TocEntry[], unit = "件"): string | null {
  const sorted = [...entries].sort((a, b) => a.startSec - b.startSec);
  const lines: { sec: number; text: string }[] = [{ sec: 0, text: "はじめ" }];
  for (const e of sorted) {
    if (e.startSec - lines[lines.length - 1].sec < CHAPTER_GAP_SEC) continue;
    lines.push({
      sec: e.startSec,
      text: `盛り上がり（${e.count.toLocaleString("ja-JP")} ${unit}）`,
    });
  }
  if (lines.length < CHAPTER_MIN) return null;
  return lines.map((l) => `${formatClock(l.sec)} ${l.text}`).join("\n");
}

/**
 * 切り抜きの範囲を、yt-dlp の --download-sections 付きのコマンドにする。範囲がなければ null。
 * 動画を落とすのは使う人の手元で、Cometrix のサーバーでは落とさない。
 * 引数は二重引用符でくくる（macOS・Linux のシェルと Windows のどちらでもそのまま貼れる）。URL は検証済みの形だけ。
 */
export function ytDlpCommand(url: string, clips: Pick<Clip, "start" | "end">[]): string | null {
  if (clips.length === 0 || !/^https:\/\/[\w./?=&%-]+$/.test(url)) return null;
  const sections = [...clips]
    .sort((a, b) => a.start - b.start)
    .map((c) => `--download-sections "*${formatClock(c.start)}-${formatClock(c.end)}"`);
  return ["yt-dlp", ...sections, '-o "%(title)s_%(section_start)s.%(ext)s"', `"${url}"`].join(" ");
}

const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    // XML 1.0 で使えない制御文字は消す
    // biome-ignore lint/suspicious/noControlCharactersInRegex: 使えない文字を消すための式
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export const XML_FPS = 30;

/**
 * 切り抜きの範囲をマーカーにした XML（Final Cut Pro 7 の XML。Premiere Pro・DaVinci Resolve で読める）。
 * 動画は入れず、配信の長さの空のシーケンスにマーカーだけを置く。読み込んだあと、手元の動画を並べて使う。
 */
export function markerXml(
  title: string,
  durationSec: number,
  clips: Pick<Clip, "name" | "start" | "end">[],
): string {
  const f = (sec: number) => Math.round(sec * XML_FPS);
  const end = Math.max(durationSec, ...clips.map((c) => c.end), 1);
  const markers = [...clips]
    .sort((a, b) => a.start - b.start)
    .map(
      (c, i) => `      <marker>
        <name>${xml(c.name || `範囲${i + 1}`)}</name>
        <comment>${formatClock(c.start)}〜${formatClock(c.end)}</comment>
        <in>${f(c.start)}</in>
        <out>${f(c.end)}</out>
      </marker>`,
    )
    .join("\n");
  const rate = `<rate><timebase>${XML_FPS}</timebase><ntsc>FALSE</ntsc></rate>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${xml(title || "Cometrix")}</name>
    <duration>${f(end)}</duration>
    ${rate}
    <timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
    <media><video><format><samplecharacteristics>${rate}<width>1920</width><height>1080</height></samplecharacteristics></format><track></track></video><audio><track></track></audio></media>
${markers}
  </sequence>
</xmeml>
`;
}

/** 保存するファイルの名前。使えない文字を _ にし、長すぎるタイトルは切る。 */
export function exportFileName(title: string, ext: string): string {
  const base = (title || "cometrix")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ファイル名に使えない文字を消すための式
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 60);
  return `${base || "cometrix"}.${ext}`;
}
