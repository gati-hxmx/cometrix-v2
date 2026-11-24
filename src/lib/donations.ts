import type { DonationKind } from "./buckets";

export type Donation = {
  id: number;
  offsetMs: number;
  author: string;
  body: string;
  kind: DonationKind;
  amount: string | null;
};

export const KIND_LABEL: Record<DonationKind, string> = {
  paid: "スパチャ",
  sticker: "ステッカー",
  member: "メンバー加入",
  bits: "ビッツ",
};

/** 金額つきの表示（例「スパチャ ¥500」）。金額がなければ種類だけ。 */
export function kindText(d: { kind: DonationKind; amount: string | null }): string {
  return d.amount ? `${KIND_LABEL[d.kind]} ${d.amount}` : KIND_LABEL[d.kind];
}

export type DonationMark = {
  /** グラフの棒の番号（表示中の範囲の先頭から数える）。 */
  bar: number;
  /** その棒の中で最初の投げ銭の秒（押したときに飛ぶ先）。 */
  sec: number;
  items: Donation[];
};

/**
 * 投げ銭を、グラフの棒ごとの印にまとめる。
 * 棒は 30 秒の区間を group 個ずつまとめたもの。表示範囲（区間の番号 [startBucket, endBucket)）の外は除く。
 */
export function groupDonations(
  donations: Donation[],
  opts: { bucketSec: number; startBucket: number; endBucket: number; group: number },
): DonationMark[] {
  const { bucketSec, startBucket, endBucket, group } = opts;
  const by = new Map<number, DonationMark>();
  for (const d of [...donations].sort((a, b) => a.offsetMs - b.offsetMs || a.id - b.id)) {
    if (d.offsetMs < 0) continue;
    const sec = d.offsetMs / 1000;
    const bucket = Math.floor(sec / bucketSec);
    if (bucket < startBucket || bucket >= endBucket) continue;
    const bar = Math.floor((bucket - startBucket) / group);
    const cur = by.get(bar);
    if (cur) cur.items.push(d);
    else by.set(bar, { bar, sec, items: [d] });
  }
  return [...by.values()].sort((a, b) => a.bar - b.bar);
}
