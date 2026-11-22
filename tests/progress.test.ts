import { describe, expect, test } from "vitest";
import {
  lastOffsetSec,
  parseDuration,
  progressLabel,
  progressPercent,
  readProgress,
} from "../src/lib/progress";
import { ytDlpArgs } from "../src/worker/fetch-chat";

describe("取得の進み具合（#43）", () => {
  test("書きかけの live_chat.json の末尾から、最後のコメントの時刻を読む", () => {
    const tail = [
      '…途中で切れた行"}}',
      '{"replayChatItemAction":{"actions":[],"videoOffsetTimeMsec":"61000"}}',
      '{"replayChatItemAction":{"actions":[],"videoOffsetTimeMsec":"5025999"}}',
      '{"replayChatItemAction":{"actions":[],"videoOffsetTimeMsec":"50',
    ].join("\n");
    expect(lastOffsetSec(tail)).toBe(5025);
    expect(lastOffsetSec("")).toBeNull();
  });

  test("配信の長さは数だけ受け付ける", () => {
    expect(parseDuration("24037\n")).toBe(24037);
    expect(parseDuration("NA")).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration("0")).toBeNull();
  });

  test("％ は取得中は 99 で止め、保存中は 100", () => {
    expect(progressPercent({ stage: "fetching", fetchedSec: 5025, durationSec: 24037 })).toBe(20);
    expect(progressPercent({ stage: "fetching", fetchedSec: 30000, durationSec: 24037 })).toBe(99);
    expect(progressPercent({ stage: "saving", fetchedSec: 100, durationSec: 24037 })).toBe(100);
    expect(progressPercent({ stage: "fetching", fetchedSec: 100, durationSec: null })).toBeNull();
  });

  test("画面の1行", () => {
    expect(progressLabel({ stage: "fetching", fetchedSec: 5025, durationSec: 24037 })).toBe(
      "20%（1:23:45 / 6:40:37 まで取得）",
    );
    expect(progressLabel({ stage: "fetching", fetchedSec: 5025, durationSec: null })).toBe(
      "1:23:45 まで取得",
    );
    expect(progressLabel({ stage: "saving", fetchedSec: 0, durationSec: null })).toContain(
      "集計して保存",
    );
  });

  test("jobs.result から進み具合を取り出す。形が違えば null", () => {
    expect(
      readProgress({ progress: { stage: "fetching", fetchedSec: 3, durationSec: 9 } }),
    ).toEqual({ stage: "fetching", fetchedSec: 3, durationSec: 9 });
    expect(readProgress({ totalComments: 4 })).toBeNull();
    expect(readProgress(null)).toBeNull();
  });

  test("yt-dlp にはタイトルの次に配信の長さを出させる", () => {
    const args = ytDlpArgs("https://www.youtube.com/watch?v=aaaaaaaaaaa", "/tmp/x/chat");
    const prints = args.flatMap((a, i) => (args[i - 1] === "--print" ? [a] : []));
    // 3・4行目は常連と初見（#64）のためのチャンネルと配信の時刻
    expect(prints).toEqual(["title", "duration", "channel_id", "%(release_timestamp,timestamp)s"]);
  });
});
