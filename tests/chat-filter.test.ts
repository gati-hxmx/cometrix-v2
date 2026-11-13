import { describe, expect, test } from "vitest";
import {
  addTerm,
  EMPTY_FILTER,
  type Filter,
  fillBuckets,
  filterParams,
  isFiltering,
  matches,
  nearestIndex,
  normalizeTerm,
  parseFilter,
  parseIntParam,
} from "../src/lib/chat-filter";

const f = (p: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...p });

describe("normalizeTerm", () => {
  test("前後の空白を除き小文字にする", () => expect(normalizeTerm("  AbC ")).toBe("abc"));
  test("空白だけは絞り込まない", () => expect(normalizeTerm("   ")).toBeNull());
});

describe("matches", () => {
  const m = { author: "Taro_Yamada", body: "Hello 100% World" };
  test("含めるワードは本文の部分一致（大文字小文字を区別しない）", () => {
    expect(matches(m, f({ q: ["hello"] }))).toBe(true);
    expect(matches(m, f({ q: ["taro"] }))).toBe(false);
  });
  test("含めるワードを複数入れると OR", () => {
    expect(matches(m, f({ q: ["zzz", "world"] }))).toBe(true);
    expect(matches(m, f({ q: ["zzz", "yyy"] }))).toBe(false);
  });
  test("除外ワードのどれかを含めば除く。含める条件より優先", () => {
    expect(matches(m, f({ xq: ["zzz", "world"] }))).toBe(false);
    expect(matches(m, f({ q: ["hello"], xq: ["world"] }))).toBe(false);
    expect(matches(m, f({ xq: ["zzz"] }))).toBe(true);
  });
  test("含めるユーザーは OR、除外ユーザーは優先", () => {
    expect(matches(m, f({ user: ["zzz", "yamada"] }))).toBe(true);
    expect(matches(m, f({ user: ["zzz"] }))).toBe(false);
    expect(matches(m, f({ user: ["yamada"], xuser: ["taro"] }))).toBe(false);
    expect(matches(m, f({ xuser: ["zzz"] }))).toBe(true);
  });
  test("ワードとユーザーの両方は AND", () => {
    expect(matches(m, f({ q: ["world"], user: ["taro"] }))).toBe(true);
    expect(matches(m, f({ q: ["world"], user: ["zzz"] }))).toBe(false);
  });
  test("除外ワードは名前には効かず、除外ユーザーは本文には効かない", () => {
    expect(matches(m, f({ xq: ["taro"] }))).toBe(true);
    expect(matches(m, f({ xuser: ["hello"] }))).toBe(true);
  });
  test("% や _ は文字として扱う", () => {
    expect(matches(m, f({ q: ["100%"] }))).toBe(true);
    expect(matches(m, f({ q: ["_"] }))).toBe(false);
  });
  test("指定なしは全部一致", () => expect(matches(m, EMPTY_FILTER)).toBe(true));
});

describe("parseFilter", () => {
  const parse = (s: string) => parseFilter(new URLSearchParams(s));
  test("1語100文字までは通り、超えると不正", () => {
    expect(parse(`q=${"a".repeat(100)}`).ok).toBe(true);
    expect(parse(`user=${"a".repeat(101)}`).ok).toBe(false);
    expect(parse(`xq=${"a".repeat(101)}`).ok).toBe(false);
  });
  test("正規化して返す（旧来の q・user 1つはそのまま使える）", () => {
    expect(parse("q=%20X%20&user=Bob")).toEqual({
      ok: true,
      filter: f({ q: ["x"], user: ["bob"] }),
    });
  });
  test("繰り返しの指定を読む。空と重複は無視", () => {
    expect(parse("q=a&q=b&q=&q=A&xq=c&xuser=d")).toEqual({
      ok: true,
      filter: f({ q: ["a", "b"], xq: ["c"], xuser: ["d"] }),
    });
  });
  test("1種類10語まで", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `q=w${i}`).join("&");
    expect(parse(ten).ok).toBe(true);
    expect(parse(`${ten}&q=w10`).ok).toBe(false);
  });
});

describe("filterParams", () => {
  test("parseFilter と往復できる", () => {
    const x = f({ q: ["a", "b"], xuser: ["c"] });
    expect(parseFilter(filterParams(x))).toEqual({ ok: true, filter: x });
  });
});

describe("addTerm / isFiltering", () => {
  test("正規化して足す", () =>
    expect(addTerm(["a"], " B ")).toEqual({ ok: true, list: ["a", "b"] }));
  test("空・重複・上限・長すぎは断る", () => {
    expect(addTerm([], "  ")).toEqual({ ok: false, reason: "empty" });
    expect(addTerm(["a"], "A")).toEqual({ ok: false, reason: "duplicate" });
    expect(
      addTerm(
        Array.from({ length: 10 }, (_, i) => `w${i}`),
        "x",
      ),
    ).toEqual({
      ok: false,
      reason: "full",
    });
    expect(addTerm([], "a".repeat(101))).toEqual({ ok: false, reason: "long" });
  });
  test("どれか1つでも語があれば絞り込み中", () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering(f({ xuser: ["a"] }))).toBe(true);
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
