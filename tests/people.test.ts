import { expect, test } from "vitest";
import { firstTimerText, peopleSummary } from "../src/lib/people";
import { parsePrinted } from "../src/worker/fetch-chat";

// 常連と初見（#64）。
test("yt-dlp の出力から、タイトル・チャンネル・配信の時刻を読む", () => {
  expect(parsePrinted("配信\n120\nUCabcdefghijklmnopqrstuv\n1700000000\n")).toEqual({
    title: "配信",
    channelId: "youtube:UCabcdefghijklmnopqrstuv",
    streamedAt: 1700000000,
  });
});

test("読めないチャンネル・時刻は無しにする", () => {
  expect(parsePrinted("配信\n120\nNA\nNA\n")).toEqual({ title: "配信" });
  expect(parsePrinted("配信\n120\n")).toEqual({ title: "配信" });
  expect(parsePrinted("")).toEqual({ title: "" });
});

test("初見の文。比べる配信がなければ出さない", () => {
  const p = peopleSummary([], 800, { count: 120, pastJobs: 3 });
  expect(firstTimerText(p)).toBe("うち初めての人 120 人（15%）");
  expect(firstTimerText(peopleSummary([], 800, null))).toBeNull();
  expect(firstTimerText(peopleSummary([], 0, { count: 0, pastJobs: 1 }))).toBeNull();
});
