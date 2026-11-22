import { type Bucket, formatTime, groupBuckets, peakIndex } from "./chart";
import { timeTicks, valueTicks } from "./chart-range";

// グラフを PNG で保存する（#69）。切り抜き動画や X の投稿にそのまま使えるよう、
// タイトル・見出し・時刻と数の目盛りを1枚に入れる。色は今の見た目（ライト・ダーク）のまま。

/** X・OGP の横長の大きさ（1.91:1）。 */
export const IMAGE_W = 1200;
export const IMAGE_H = 630;
const BARS = 120;
const PAD = 48;

export type ChartImage = {
  /** 動画のタイトル */
  title: string;
  /** 「コメント数（30秒ごと）」などの見出し */
  heading: string;
  unit: string;
  /** 今グラフに出している範囲の区間（まとめる前） */
  buckets: Bucket[];
  /** 区間の長さ（秒） */
  bucketSec: number;
  /** 人数は足さずに大きい方を取る（#55） */
  combine: "sum" | "max";
};

export type Palette = {
  bg: string;
  text: string;
  muted: string;
  line: string;
  bar: string;
  peak: string;
  font: string;
};

type Box = { x: number; y: number; w: number; h: number };

export type ChartLayout = {
  plot: Box;
  bars: (Box & { peak: boolean })[];
  yTicks: { label: string; y: number }[];
  xTicks: { label: string; x: number }[];
  /** 「0:00:00〜10:00:00」 */
  span: string;
  /** 棒1本の長さ（秒）。長い配信では区間をまとめるので 30秒より長くなる */
  barSec: number;
};

/** 棒1本の長さを「30秒」「5分」「2分30秒」「1時間」の形にする。 */
export function intervalLabel(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return `${h ? `${h}時間` : ""}${m ? `${m}分` : ""}${s || sec === 0 ? `${s}秒` : ""}`;
}

/** 見出しの「（30秒ごと）」を、画像の棒1本の長さに直す（まとめた棒に 30秒あたりの数と読まれないように）。 */
export function headingFor(heading: string, barSec: number): string {
  const label = `（${intervalLabel(barSec)}ごと）`;
  return /（[^（）]*ごと）$/.test(heading)
    ? heading.replace(/（[^（）]*ごと）$/, label)
    : `${heading}${label}`;
}

/** 描く位置を決める（描くこととは分け、テストで確かめられるようにする）。 */
export function chartLayout(img: ChartImage, w = IMAGE_W, h = IMAGE_H): ChartLayout {
  const plot: Box = { x: PAD + 56, y: PAD + 124, w: w - PAD * 2 - 56, h: h - PAD * 2 - 124 - 40 };
  const grouped = groupBuckets(img.buckets, BARS, img.combine);
  const group = grouped.length > 0 ? Math.ceil(img.buckets.length / grouped.length) : 1;
  const ticks = valueTicks(Math.max(1, ...grouped.map((b) => b.count)));
  const top = ticks.at(-1) ?? 1;
  const peak = peakIndex(grouped);
  const slot = grouped.length > 0 ? plot.w / grouped.length : 0;
  const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
  const bars = grouped.map((b, i) => {
    const bh = b.count === 0 ? 0 : Math.max(2, (b.count / top) * plot.h);
    return {
      x: plot.x + i * slot + gap / 2,
      y: plot.y + plot.h - bh,
      w: Math.max(1, slot - gap),
      h: bh,
      peak: i === peak,
    };
  });
  const fromSec = img.buckets[0]?.startSec ?? 0;
  const toSec = (img.buckets.at(-1)?.startSec ?? 0) + img.bucketSec;
  const xOf = (sec: number) => plot.x + ((sec - fromSec) / Math.max(1, toSec - fromSec)) * plot.w;
  return {
    plot,
    bars,
    yTicks: ticks.map((v) => ({
      label: v.toLocaleString("ja-JP"),
      y: plot.y + plot.h - (v / top) * plot.h,
    })),
    xTicks: timeTicks(fromSec, toSec, 8)
      .filter((t) => t < toSec)
      .map((t) => ({ label: formatTime(t), x: xOf(t) })),
    span: `${formatTime(fromSec)}〜${formatTime(toSec)}`,
    barSec: group * img.bucketSec,
  };
}

/** 長いタイトルは幅に収まるよう後ろを「…」にする。 */
export function fitText(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && measure(`${chars.join("")}…`) > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "fillRect"
  | "fillText"
  | "measureText"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
>;

export function drawChart(ctx: Ctx, img: ChartImage, p: Palette, w = IMAGE_W, h = IMAGE_H) {
  const l = chartLayout(img, w, h);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = p.text;
  ctx.font = `700 30px ${p.font}`;
  ctx.fillText(
    fitText(img.title || "Cometrix", w - PAD * 2, (s) => ctx.measureText(s).width),
    PAD,
    PAD + 30,
  );
  ctx.font = `400 20px ${p.font}`;
  ctx.fillStyle = p.muted;
  ctx.fillText(`${headingFor(img.heading, l.barSec)}・${l.span}`, PAD, PAD + 66);

  // 横の目盛り線と数
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `400 16px ${p.font}`;
  for (const t of l.yTicks) {
    ctx.beginPath();
    ctx.moveTo(l.plot.x, Math.round(t.y) + 0.5);
    ctx.lineTo(l.plot.x + l.plot.w, Math.round(t.y) + 0.5);
    ctx.stroke();
    ctx.fillText(t.label, l.plot.x - 10, t.y);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(img.unit, l.plot.x - 40, l.plot.y - 14);

  for (const b of l.bars) {
    ctx.fillStyle = b.peak ? p.peak : p.bar;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  // 時刻の目盛り
  ctx.fillStyle = p.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of l.xTicks) ctx.fillText(t.label, t.x, l.plot.y + l.plot.h + 10);

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("Cometrix", w - PAD, h - 12);
}
