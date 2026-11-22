import { describe, expect, test } from "vitest";
import { addRegex, EMPTY_FILTER, type Filter, matches, parseFilter } from "../src/lib/chat-filter";
import { dropSpam, SPAM_LONG } from "../src/lib/spam";

const m = (offsetMs: number, author: string, body: string) => ({ offsetMs, author, body });
const bodies = (xs: { body: string }[]) => xs.map((x) => x.body);

describe("dropSpam", () => {
  test("同じ人の同じ文は30秒未満なら2回目以降を数えない（最初は数える）", () => {
    const r = dropSpam([m(0, "a", "草"), m(10000, "a", "草"), m(20000, "a", "草")]);
    expect(r).toHaveLength(1);
  });
  test("30秒ちょうどは数える。連鎖：数えない側が直前でも続く", () => {
    expect(dropSpam([m(0, "a", "x"), m(30000, "a", "x")])).toHaveLength(2);
    // 0, 20, 40 秒：40 秒は 20 秒（数えない側）から 20 秒なので数えない
    expect(dropSpam([m(0, "a", "x"), m(20000, "a", "x"), m(40000, "a", "x")])).toHaveLength(1);
  });
  test("別の人・別の文は数える。前後の空白と大文字小文字は同じ文とみなす", () => {
    expect(dropSpam([m(0, "a", "x"), m(1000, "b", "x"), m(2000, "a", "y")])).toHaveLength(3);
    expect(dropSpam([m(0, "a", "Hi"), m(1000, "a", " hi　")])).toHaveLength(1);
  });
  test("100文字以上は数えない（99文字は数える）", () => {
    expect(dropSpam([m(0, "a", "あ".repeat(SPAM_LONG - 1))])).toHaveLength(1);
    expect(dropSpam([m(0, "a", "あ".repeat(SPAM_LONG))])).toHaveLength(0);
    expect(dropSpam([m(0, "a", `  ${"あ".repeat(SPAM_LONG - 1)}  `)])).toHaveLength(1);
  });
  test("動画開始前は除き、入力の順を保つ", () => {
    expect(bodies(dropSpam([m(5000, "a", "b"), m(-1, "a", "c"), m(1000, "a", "d")]))).toEqual([
      "b",
      "d",
    ]);
  });
});

describe("正規表現の絞り込み", () => {
  const f = (p: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...p });
  const c = (body: string) => ({ author: "taro", body });
  test("re はどれかに当たる／xre に当たれば残らない／大文字小文字は区別しない", () => {
    expect(matches(c("ABC 123"), f({ re: ["^[0-9]+$", "abc"] }))).toBe(true);
    expect(matches(c("zzz"), f({ re: ["^[0-9]+$"] }))).toBe(false);
    expect(matches(c("abc"), f({ re: ["abc"], xre: ["^a"] }))).toBe(false);
  });
  test("\\S などの大文字は小文字にされない", () => {
    expect(matches(c("a b"), f({ re: ["^\\S+$"] }))).toBe(false);
    expect(matches(c("ab"), f({ re: ["^\\S+$"] }))).toBe(true);
  });
  test("q・user と AND", () => {
    expect(matches(c("hello 1"), f({ q: ["hello"], re: ["[0-9]"] }))).toBe(true);
    expect(matches(c("hello"), f({ q: ["hello"], re: ["[0-9]"] }))).toBe(false);
  });
  test("不正な正規表現でも落ちない（追加は断り、API は不正扱い、matches は一致しない）", () => {
    expect(addRegex([], "(")).toEqual({ ok: false, reason: "invalid" });
    expect(addRegex([], "[a-")).toEqual({ ok: false, reason: "invalid" });
    expect(parseFilter(new URLSearchParams("re=(")).ok).toBe(false);
    expect(parseFilter(new URLSearchParams("xre=[a-")).ok).toBe(false);
    expect(matches(c("x"), f({ re: ["("] }))).toBe(false);
  });
  test("追加の境界：空・重複・長すぎ・上限", () => {
    expect(addRegex([], "  ")).toEqual({ ok: false, reason: "empty" });
    expect(addRegex(["a"], "a")).toEqual({ ok: false, reason: "duplicate" });
    expect(addRegex([], "a".repeat(101))).toEqual({ ok: false, reason: "long" });
    expect(
      addRegex(
        Array.from({ length: 10 }, (_, i) => `a${i}`),
        "b",
      ),
    ).toEqual({
      ok: false,
      reason: "full",
    });
    expect(addRegex([], " ^A$ ")).toEqual({ ok: true, list: ["^A$"] });
  });
  test("parseFilter は re・xre を読み、小文字にしない", () => {
    const r = parseFilter(new URLSearchParams("re=%5C%5CS%2B&xre=%5E%21"));
    expect(r.ok && r.filter.re).toEqual(["\\\\S+"]);
    expect(r.ok && r.filter.xre).toEqual(["^!"]);
  });
});
