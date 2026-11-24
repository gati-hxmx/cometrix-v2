import type { ChatMessage, DonationKind } from "../lib/buckets";

type Run = { text?: string; emoji?: { shortcuts?: string[]; emojiId?: string } };
type Renderer = {
  authorName?: { simpleText?: string };
  message?: { runs?: Run[] };
  purchaseAmountText?: { simpleText?: string };
};

const RENDERERS = [
  ["liveChatTextMessageRenderer", undefined],
  ["liveChatPaidMessageRenderer", "paid"],
  ["liveChatPaidStickerRenderer", "sticker"],
  ["liveChatMembershipItemRenderer", "member"],
] as const satisfies readonly (readonly [string, DonationKind | undefined])[];

function textOf(r: Renderer): string {
  return (r.message?.runs ?? [])
    .map((x) => x.text ?? x.emoji?.shortcuts?.[0] ?? x.emoji?.emojiId ?? "")
    .join("");
}

/** yt-dlp の live_chat.json（1行1JSON）をコメントの配列にする。読めない行は飛ばす。 */
export function parseLiveChat(jsonl: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let obj: { replayChatItemAction?: { videoOffsetTimeMsec?: unknown; actions?: unknown[] } };
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const replay = obj?.replayChatItemAction;
    if (!replay) continue;
    const offsetMs = Number(replay.videoOffsetTimeMsec);
    if (!Number.isFinite(offsetMs)) continue;
    for (const action of (replay.actions ?? []) as {
      addChatItemAction?: { item?: Record<string, Renderer | undefined> };
    }[]) {
      const item = action?.addChatItemAction?.item;
      if (!item) continue;
      for (const [key, kind] of RENDERERS) {
        const r = item[key];
        if (!r) continue;
        const m: ChatMessage = {
          offsetMs,
          author: r.authorName?.simpleText ?? "",
          text: textOf(r),
        };
        if (kind) {
          m.kind = kind;
          const amount = r.purchaseAmountText?.simpleText;
          if (amount) m.amount = amount;
        }
        out.push(m);
      }
    }
  }
  return out;
}
