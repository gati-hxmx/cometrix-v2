import { describe, expect, it } from "vitest";
import { formatStamp, insertAt, MEMO_MAX, splitMemo } from "../src/lib/memo";

describe("formatStamp", () => {
  it("1時間未満は [m:ss]、以上は [h:mm:ss]", () => {
    expect(formatStamp(0)).toBe("[0:00]");
    expect(formatStamp(65.9)).toBe("[1:05]");
    expect(formatStamp(3599)).toBe("[59:59]");
    expect(formatStamp(3600)).toBe("[1:00:00]");
    expect(formatStamp(3725)).toBe("[1:02:05]");
  });
  it("負・NaN は [0:00]", () => {
    expect(formatStamp(-5)).toBe("[0:00]");
    expect(formatStamp(Number.NaN)).toBe("[0:00]");
  });
});

describe("splitMemo", () => {
  it("正しい時刻だけ秒に直す", () => {
    expect(splitMemo("a [1:05] b [1:02:03]")).toEqual([
      { text: "a " },
      { text: "[1:05]", sec: 65 },
      { text: " b " },
      { text: "[1:02:03]", sec: 3723 },
    ]);
  });
  it("不正な書式は文字のまま", () => {
    expect(splitMemo("[99:99] [1:5] [1:2:3]")).toEqual([{ text: "[99:99] [1:5] [1:2:3]" }]);
  });
  it("空は空", () => expect(splitMemo("")).toEqual([]));
});

describe("insertAt", () => {
  it("カーソル位置に入れ、選択は置き換える", () => {
    expect(insertAt("abcd", "[0:01]", { start: 2, end: 2 })).toEqual({
      text: "ab[0:01]cd",
      caret: 8,
    });
    expect(insertAt("abcd", "X", { start: 1, end: 3 })).toEqual({ text: "aXd", caret: 2 });
  });
  it("選択なしは末尾", () => {
    expect(insertAt("ab", "X", null)).toEqual({ text: "abX", caret: 3 });
  });
  it("上限を超えない", () => {
    const r = insertAt("a".repeat(MEMO_MAX), "[0:01]", null);
    expect(r.text.length).toBe(MEMO_MAX);
  });
});
