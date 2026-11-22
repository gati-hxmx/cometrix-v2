import { describe, expect, test } from "vitest";
import { addKeyword, hasTerm, normalizeKeyword } from "../src/lib/term";
import { TERM_SAMPLES } from "./fixtures/term-samples";

describe("言葉の数え方", () => {
  test("見本どおりに判定する（大文字小文字・全角半角・スタンプ名）", () => {
    for (const [term, body, want] of TERM_SAMPLES) {
      const t = normalizeKeyword(term);
      expect(t, term).not.toBeNull();
      expect(hasTerm(body, t as string), `${term} / ${body}`).toBe(want);
    }
  });

  test("言葉は前後の空白（全角も）を除いて整える。空・空白だけ・101 文字以上は null", () => {
    expect(normalizeKeyword("  ＬＯＬ　")).toBe("lol");
    expect(normalizeKeyword("")).toBeNull();
    expect(normalizeKeyword(" 　 ")).toBeNull();
    expect(normalizeKeyword("a".repeat(100))).not.toBeNull();
    expect(normalizeKeyword("a".repeat(101))).toBeNull();
  });

  test("言葉の追加：重複（正規化後）・空・長すぎ・3つ目は断る", () => {
    expect(addKeyword([], "LOL")).toEqual({ ok: true, list: ["lol"] });
    expect(addKeyword(["lol"], "ｌｏｌ")).toEqual({ ok: false, reason: "duplicate" });
    expect(addKeyword([], "  ")).toEqual({ ok: false, reason: "empty" });
    expect(addKeyword([], "a".repeat(101))).toEqual({ ok: false, reason: "long" });
    expect(addKeyword(["a", "b"], "c")).toEqual({ ok: false, reason: "full" });
  });
});
