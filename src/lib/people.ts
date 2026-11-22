// 常連と初見（#64）の形。上位は10人まで。

export const TOP_PEOPLE = 10;

export type Person = { author: string; count: number };

export type People = {
  top: Person[];
  /** この配信でコメントした人の数（同じ人は1人） */
  authors: number;
  /** 同じチャンネルの前の配信と比べた初見の数。比べる配信がなければ null */
  firstTimers: { count: number; pastJobs: number } | null;
};

export function peopleSummary(
  top: Person[],
  authors: number,
  firstTimers: People["firstTimers"],
): People {
  return { top: top.slice(0, TOP_PEOPLE), authors, firstTimers };
}

/** 「うち初めての人 120 人（15%）」の文。比べる配信がなければ null。 */
export function firstTimerText(p: People): string | null {
  if (!p.firstTimers || p.authors === 0) return null;
  const pct = Math.round((p.firstTimers.count / p.authors) * 100);
  return `うち初めての人 ${p.firstTimers.count.toLocaleString("ja-JP")} 人（${pct}%）`;
}
