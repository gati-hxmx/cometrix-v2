import type { Bucket } from "./buckets";

// 共有リンクを SNS に貼ったときの絵（#68）の中身。描くのは src/app/s/[token]/opengraph-image.tsx。

export const OGP_BARS = 96;
export const OGP_TITLE_MAX = 60;

/** 棒の高さ（0〜1）。棒が多すぎると細くて見えないので、OGP_BARS 本までにまとめる（区間の合計）。いちばん高い棒は peak。 */
export function ogpBars(buckets: Bucket[], n = OGP_BARS): { h: number; peak: boolean }[] {
  if (buckets.length === 0) return [];
  const per = Math.ceil(buckets.length / n);
  const sums: number[] = [];
  for (let i = 0; i < buckets.length; i += per)
    sums.push(buckets.slice(i, i + per).reduce((a, b) => a + b.count, 0));
  const max = Math.max(...sums);
  if (max === 0) return sums.map(() => ({ h: 0, peak: false }));
  const top = sums.indexOf(max);
  return sums.map((v, i) => ({ h: v / max, peak: i === top }));
}

/** 長いタイトルは「…」で切る（2行に収める） */
export function ogpTitle(title: string, max = OGP_TITLE_MAX): string {
  const chars = Array.from(title.trim());
  if (chars.length === 0) return "配信の盛り上がり";
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/**
 * 日本語の字（Noto Sans JP の太字）を、使う字だけ Google Fonts から取る。取れなければ null（絵は字なしで作る）。
 * 送るのは絵に書く字（動画のタイトルなど、公開されている文字）だけ。
 */
export async function loadOgpFont(
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetcher(
        `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`,
        { signal: AbortSignal.timeout(3000) },
      )
    ).text();
    const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetcher(url, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
