import { describe, expect, test } from "vitest";
import {
  fillBuckets,
  matches,
  nearestIndex,
  normalizeTerm,
  parseFilter,
  parseIntParam,
} from "../src/lib/chat-filter";

describe("normalizeTerm", () => {
  test("前後の空白を除き小文字にする", () => expect(normalizeTerm("  AbC ")).toBe("abc"));
  test("空白だけは絞り込まない", () => expect(normalizeTerm("   ")).toBeNull());
});

describe("matches", () => {
  const m = { author: "Taro_Yamada", body: "Hello 100% World" };
  test("キーワードは本文の部分一致（大文字小文字を区別しない）", () => {
    expect(matches(m, { q: "hello", user: null })).toBe(true);
    expect(matches(m, { q: "taro", user: null })).toBe(false);
  });
  test("ユーザー名は名前の部分一致", () => {
    expect(matches(m, { q: null, user: "yamada" })).toBe(true);
    expect(matches(m, { q: null, user: "hello" })).toBe(false);
  });
  test("両方指定は AND", () => {
    expect(matches(m, { q: "world", user: "taro" })).toBe(true);
    expect(matches(m, { q: "world", user: "zzz" })).toBe(false);
  });
  test("% や _ は文字として扱う", () => {
    expect(matches(m, { q: "100%", user: null })).toBe(true);
    expect(matches(m, { q: "_", user: null })).toBe(false);
  });
  test("指定なしは全部一致", () => expect(matches(m, { q: null, user: null })).toBe(true));
});

describe("parseFilter", () => {
  test("100文字までは通り、超えると不正", () => {
    expect(parseFilter(new URLSearchParams({ q: "a".repeat(100) })).ok).toBe(true);
    expect(parseFilter(new URLSearchParams({ user: "a".repeat(101) })).ok).toBe(false);
  });
  test("正規化して返す", () => {
    expect(parseFilter(new URLSearchParams({ q: " X " }))).toEqual({
      ok: true,
      q: "x",
      user: null,
    });
  });
});

describe("parseIntParam", () => {
  test("未指定は既定値", () => expect(parseIntParam(null, 7)).toBe(7));
  test("整数", () => expect(parseIntParam("12", 0)).toBe(12));
  test("負・小数・文字は不正", () => {
    for (const v of ["-1", "1.5", "abc"]) expect(parseIntParam(v, 0)).toBeNull();
  });
});

describe("fillBuckets", () => {
  test("0件の区間も連続にそろえる", () => {
    expect(fillBuckets([{ startSec: 60, count: 2 }], 90)).toEqual([
      { startSec: 0, count: 0 },
      { startSec: 30, count: 0 },
      { startSec: 60, count: 2 },
      { startSec: 90, count: 0 },
    ]);
  });
});

describe("nearestIndex", () => {
  test("再生位置に最も近い行", () => expect(nearestIndex([0, 10000, 50000], 12)).toBe(1));
  test("空なら -1", () => expect(nearestIndex([], 5)).toBe(-1));
});
