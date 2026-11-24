import { describe, expect, test } from "vitest";
import { parseLiveChat } from "../src/worker/chat-parse";
import { parseCommentsPage, toMessage } from "../src/worker/twitch-chat";

const line = (renderer: string, body: Record<string, unknown>) =>
  JSON.stringify({
    replayChatItemAction: {
      videoOffsetTimeMsec: "5000",
      actions: [{ addChatItemAction: { item: { [renderer]: body } } }],
    },
  });
const author = { authorName: { simpleText: "alice" } };

describe("YouTube の投げ銭の解析", () => {
  test("スパチャは paid と金額、文を保存する", () => {
    const [m] = parseLiveChat(
      line("liveChatPaidMessageRenderer", {
        ...author,
        purchaseAmountText: { simpleText: "¥500" },
        message: { runs: [{ text: "応援" }] },
      }),
    );
    expect(m).toEqual({
      offsetMs: 5000,
      author: "alice",
      text: "応援",
      kind: "paid",
      amount: "¥500",
    });
  });

  test("ステッカーは sticker、メンバー加入は member", () => {
    const [s] = parseLiveChat(
      line("liveChatPaidStickerRenderer", {
        ...author,
        purchaseAmountText: { simpleText: "$2.00" },
      }),
    );
    expect(s).toMatchObject({ kind: "sticker", amount: "$2.00" });
    const [m] = parseLiveChat(line("liveChatMembershipItemRenderer", author));
    expect(m.kind).toBe("member");
  });

  test("金額が読めなくても失敗にせず、金額なしで保存する", () => {
    const [m] = parseLiveChat(line("liveChatPaidMessageRenderer", author));
    expect(m.kind).toBe("paid");
    expect(m).not.toHaveProperty("amount");
  });

  test("通常コメントは kind を持たない", () => {
    const [m] = parseLiveChat(line("liveChatTextMessageRenderer", author));
    expect(m).not.toHaveProperty("kind");
    expect(m).not.toHaveProperty("amount");
  });
});

describe("Twitch のビッツ", () => {
  const node = (fragments: { text: string; cheermote?: unknown }[]) => ({
    contentOffsetSeconds: 12,
    commenter: { displayName: "bob" },
    message: { fragments },
  });

  test("cheermote のフラグメントの数を合計して bits にする", () => {
    const m = toMessage(
      node([
        { text: "Cheer100", cheermote: {} },
        { text: " nice " },
        { text: "Kappa50", cheermote: {} },
      ]),
    );
    expect(m).toMatchObject({ kind: "bits", amount: "150 bits", offsetMs: 12000 });
  });

  test("cheermote がなければ通常コメント（Cheer100 という文字だけでは bits にしない）", () => {
    expect(toMessage(node([{ text: "Cheer100" }]))).not.toHaveProperty("kind");
  });

  test("数が読めない cheermote は通常コメント", () => {
    expect(toMessage(node([{ text: "Cheer", cheermote: {} }]))).not.toHaveProperty("kind");
  });

  test("ページの解析でも kind が残る", () => {
    const page = {
      data: {
        video: { comments: { edges: [{ node: node([{ text: "Cheer10", cheermote: {} }]) }] } },
      },
    };
    expect(parseCommentsPage(page).messages[0].kind).toBe("bits");
  });
});
