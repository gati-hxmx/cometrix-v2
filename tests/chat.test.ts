import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { bucketize, inVideo } from "../src/lib/buckets";
import { parseVideoUrl } from "../src/lib/youtube-url";
import { parseLiveChat } from "../src/worker/chat-parse";
import { classifyYtDlpError } from "../src/worker/errors";

const sample = readFileSync(new URL("./fixtures/live_chat.sample.jsonl", import.meta.url), "utf8");

test("URL の形から動画 ID を取り出して正規化する", () => {
  const want = {
    ok: true,
    videoId: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
    "https://youtu.be/dQw4w9WgXcQ?si=x",
    "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
    " https://m.youtube.com/watch?v=dQw4w9WgXcQ ",
  ])
    expect(parseVideoUrl(u)).toEqual(want);
});

test("不正な URL は invalid_url、Twitch は unsupported_url", () => {
  for (const u of [
    "",
    "abc",
    "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ;rm",
    "https://www.youtube.com/",
  ])
    expect(parseVideoUrl(u)).toEqual({ ok: false, code: "invalid_url" });
  expect(parseVideoUrl("https://www.twitch.tv/videos/123")).toEqual({
    ok: false,
    code: "unsupported_url",
  });
});

test("live_chat のサンプルからコメントを読む（絵文字・スパチャ・壊れた行）", () => {
  const msgs = parseLiveChat(sample);
  expect(msgs).toHaveLength(5);
  expect(msgs[1]).toEqual({ offsetMs: 0, author: "alice", text: "こんにちは:smile:" });
  expect(msgs[3]).toEqual({ offsetMs: 30000, author: "carol", text: "" });
});

test("集計：開始前を除き、[0,30)・[30,60) の境界と空区間を連続で出す", () => {
  const msgs = parseLiveChat(sample);
  expect(inVideo(msgs)).toHaveLength(4);
  expect(bucketize(msgs)).toEqual([
    { startSec: 0, count: 2 },
    { startSec: 30, count: 1 },
    { startSec: 60, count: 0 },
    { startSec: 90, count: 1 },
  ]);
  expect(bucketize([])).toEqual([]);
  expect(bucketize([{ offsetMs: -1, author: "a", text: "" }])).toEqual([]);
});

test("yt-dlp のエラーを失敗の種類に分ける", () => {
  expect(classifyYtDlpError("ERROR: Sign in to confirm you're not a bot")).toBe("fetch_blocked");
  expect(classifyYtDlpError("ERROR: [youtube] x: Private video. Sign in")).toBe(
    "video_unavailable",
  );
  expect(classifyYtDlpError("ERROR: [youtube] x: Video unavailable")).toBe("video_unavailable");
  expect(classifyYtDlpError("ERROR: [youtube] aaaaaaaaaaa: This video is unavailable")).toBe(
    "video_unavailable",
  );
  expect(
    classifyYtDlpError("WARNING: There are no subtitles for the requested languages: live_chat"),
  ).toBe("no_chat");
  expect(classifyYtDlpError("something odd")).toBe("fetch_failed");
  // live_chat の取得中の一時的な失敗は「チャットなし」ではない
  expect(
    classifyYtDlpError(
      "ERROR: Unable to download live_chat subtitles: HTTP Error 503: Service Unavailable",
    ),
  ).toBe("fetch_failed");
  expect(
    classifyYtDlpError(
      "WARNING: Unable to download live chat: <urlopen error [Errno 104] Connection reset>",
    ),
  ).toBe("fetch_failed");
});
