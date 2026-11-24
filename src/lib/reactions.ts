import { LAUGH_PATTERN } from "./laugh";

/**
 * 反応の種類（#62、docs/screens/analysis.md「反応の種類」）。日本の配信の言い回しで、コメントを1つの種類に分ける。
 * DB（Postgres の `~*`）と画面・テスト（JS の RegExp "i"）で同じ文字列を使うため、
 * 両方で同じ意味になる書き方だけを使う（\b・先読み・\d は使わない。lib/laugh.ts と同じ決まり）。
 * 1つのコメントがいくつもに当たるときは、この並びの先のものにする（笑い → 拍手 → 驚き → かわいい → 神 → 泣き）。
 */
export const REACTIONS = [
  { key: "laugh", name: "笑い", pattern: LAUGH_PATTERN },
  {
    key: "clap",
    name: "拍手",
    // 8888・８８８８・ﾊﾟﾁﾊﾟﾁ・パチパチ・👏
    pattern: ["8{3,}", "８{3,}", "ﾊﾟﾁ", "パチパチ", "ぱちぱち", "👏", "拍手", "(^|[^a-z])clap"].join(
      "|",
    ),
  },
  {
    key: "wow",
    name: "驚き",
    // ！？・えっ・まじ？・うそ！・😮
    pattern: [
      "[!！][?？]",
      "[?？][!！]",
      "えっ",
      "ええ[ぇっ!！?？]",
      "[まマ][じジ][かカ]?[!！?？]",
      "(うそ|嘘|ウソ)[!！?？]",
      "びっくり",
      "😮",
      "😲",
      "😱",
      "(^|[^a-z])(wow|omg)([^a-z]|$)",
    ].join("|"),
  },
  {
    key: "cute",
    name: "かわいい",
    pattern: [
      "かわい",
      "可愛",
      "カワイ",
      "かぁい",
      "kawaii",
      "(^|[^a-z])cute",
      "🥰",
      "😍",
      "💕",
    ].join("|"),
  },
  {
    key: "god",
    name: "神",
    // 神・うまい・上手・すごい・ナイス・天才・gg
    pattern: [
      "神",
      "うま[いすっ]",
      "上手",
      "すご",
      "凄",
      "すげ",
      "ナイス",
      "天才",
      "(^|[^a-z])nice",
      "(^|[^a-z])gg+([^a-z]|$)",
    ].join("|"),
  },
  {
    key: "cry",
    name: "泣き",
    pattern: ["泣", "涙", "😭", "😢", "[;；][_＿]?[;；]", "悲し", "かなし"].join("|"),
  },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];
/** どれにも当たらないもの */
export type ReactionKind = ReactionKey | "other";
export const REACTION_KEYS = REACTIONS.map((r) => r.key) as ReactionKey[];
/** 積み上げの並び（下から）。そのほかはいちばん上 */
export const REACTION_KINDS: ReactionKind[] = [...REACTION_KEYS, "other"];

export function reactionName(k: ReactionKind): string {
  return k === "other" ? "そのほか" : (REACTIONS.find((r) => r.key === k)?.name ?? k);
}

/** 色の変数（docs/design/colors.md「反応の種類の色」） */
export function reactionColor(k: ReactionKind): string {
  return `var(--r-${k})`;
}

const edges = /^[ \t\r\n　]+|[ \t\r\n　]+$/g;
const compiled = REACTIONS.map((r) => ({ key: r.key, re: new RegExp(r.pattern, "i") }));

/** コメントの反応の種類。どれにも当たらなければ "other"。 */
export function classifyReaction(text: string): ReactionKind {
  const t = text.replace(edges, "");
  return compiled.find((c) => c.re.test(t))?.key ?? "other";
}

/** 30秒ごとの、種類ごとの数 */
export type ReactionBucket = { startSec: number } & Record<ReactionKind, number>;

export function emptyReactionBucket(startSec: number): ReactionBucket {
  return { startSec, laugh: 0, clap: 0, wow: 0, cute: 0, god: 0, cry: 0, other: 0 };
}

/** 名札を出すのは、その区間でいちばん多い種類が 3 件以上で、区間のコメントの 20% 以上のとき */
export const DOMINANT_MIN = 3;
export const DOMINANT_SHARE = 0.2;

/** 区間でいちばん多い反応（そのほかは除く）。同数は並びの先。目立たなければ null。 */
export function dominantReaction(b: ReactionBucket | undefined): ReactionKey | null {
  if (!b) return null;
  const total = REACTION_KINDS.reduce((s, k) => s + b[k], 0);
  let best: ReactionKey | null = null;
  for (const k of REACTION_KEYS) if (best === null || b[k] > b[best]) best = k;
  if (best === null || b[best] < DOMINANT_MIN || b[best] < total * DOMINANT_SHARE) return null;
  return best;
}

/** 種類ごとの合計 */
export function reactionTotals(rows: ReactionBucket[]): Record<ReactionKind, number> {
  const out = emptyReactionBucket(0);
  for (const r of rows) for (const k of REACTION_KINDS) out[k] += r[k];
  const { startSec: _, ...rest } = out;
  return rest;
}

/** 「神 1,135 件（全体の 11%）」の割合。全体が 0 なら 0。 */
export function sharePercent(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
