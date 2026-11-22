import { describe, expect, test } from "vitest";
import { EMPTY_FILTER } from "../src/lib/chat-filter";
import {
  defaultName,
  MAX_NAME,
  MAX_SAVED,
  parseSaved,
  removeSaved,
  restoreSaved,
  sameAs,
  saveFilter,
  undoOverwrite,
} from "../src/lib/saved-filters";

// よく使う絞り込みの保存（#67）。保存・呼び出し・消す（元に戻す）。
const f = (over: Partial<typeof EMPTY_FILTER> = {}) => ({ ...EMPTY_FILTER, ...over });

describe("保存", () => {
  test("名前を付けて保存し、読み直しても同じ", () => {
    const r = saveFilter([], " 笑い ", f({ q: ["草", "w"], xuser: ["bot"] }), ["草"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list).toEqual([
      { name: "笑い", filter: f({ q: ["草", "w"], xuser: ["bot"] }), terms: ["草"] },
    ]);
    expect(parseSaved(JSON.stringify(r.list))).toEqual(r.list);
  });

  test("同じ名前は中身を入れ替え、並びは変えない", () => {
    let list = [] as ReturnType<typeof parseSaved>;
    for (const n of ["a", "b"]) {
      const r = saveFilter(list, n, f({ q: [n] }), []);
      if (r.ok) list = r.list;
    }
    const r = saveFilter(list, "a", f({ q: ["z"] }), []);
    expect(r.ok && r.replaced?.filter.q).toEqual(["a"]);
    expect(r.ok && r.list.map((s) => [s.name, s.filter.q[0]])).toEqual([
      ["a", "z"],
      ["b", "b"],
    ]);
  });

  test("名前が空・長すぎ・絞り込みなし・上限は理由つきで断る", () => {
    expect(saveFilter([], "  ", f({ q: ["x"] }), [])).toEqual({ ok: false, reason: "empty" });
    expect(saveFilter([], "あ".repeat(MAX_NAME + 1), f({ q: ["x"] }), [])).toEqual({
      ok: false,
      reason: "long",
    });
    expect(saveFilter([], "n", f(), [])).toEqual({ ok: false, reason: "nothing" });
    const full = Array.from({ length: MAX_SAVED }, (_, i) => ({
      name: `${i}`,
      filter: f(),
      terms: ["x"],
    }));
    expect(saveFilter(full, "new", f({ q: ["x"] }), [])).toEqual({ ok: false, reason: "full" });
  });

  test("保存した後に元の絞り込みを変えても、保存したものは変わらない", () => {
    const filter = f({ q: ["草"] });
    const r = saveFilter([], "n", filter, []);
    filter.q.push("w");
    expect(r.ok && r.list[0].filter.q).toEqual(["草"]);
  });
});

describe("呼び出し", () => {
  test("壊れたデータは飛ばす", () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved("{")).toEqual([]);
    expect(parseSaved('{"a":1}')).toEqual([]);
    expect(
      parseSaved(
        JSON.stringify([
          { name: "", filter: {} },
          { name: "ok", filter: { q: ["草"] } },
          { name: "bad", filter: { q: [1] } },
          { name: "ok", filter: {} },
        ]),
      ),
    ).toEqual([{ name: "ok", filter: f({ q: ["草"] }), terms: [] }]);
  });

  test("今の絞り込みと同じなら選んだ状態（並びは問わない）", () => {
    const s = { name: "n", filter: f({ q: ["a", "b"] }), terms: ["c"] };
    expect(sameAs(s, f({ q: ["b", "a"] }), ["c"])).toBe(true);
    expect(sameAs(s, f({ q: ["a"] }), ["c"])).toBe(false);
    expect(sameAs(s, f({ q: ["a", "b"] }), [])).toBe(false);
  });

  test("名前の候補は使っている語をつなぐ", () => {
    expect(defaultName(f({ q: ["草"], xuser: ["bot"] }), ["草", "w"])).toBe("草・w・除外 bot");
    expect(defaultName(f(), [])).toBe("");
    expect(Array.from(defaultName(f({ q: ["あ".repeat(50)] }), [])).length).toBe(MAX_NAME);
  });
});

describe("消す・元に戻す", () => {
  const list = ["a", "b", "c"].map((name) => ({ name, filter: f({ q: [name] }), terms: [] }));
  test("消して、元の位置に戻せる", () => {
    const r = removeSaved(list, "b");
    expect(r.list.map((s) => s.name)).toEqual(["a", "c"]);
    expect(r.index).toBe(1);
    expect(r.removed && restoreSaved(r.list, r.removed, r.index).map((s) => s.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("ない名前は何もしない。戻す前に同じ名前が保存されていたらそちらを残す", () => {
    expect(removeSaved(list, "z").removed).toBeNull();
    const again = [...list.slice(0, 1), { name: "b", filter: f({ q: ["new"] }), terms: [] }];
    expect(restoreSaved(again, list[1], 1)).toBe(again);
  });
});

describe("見直し（PR #111 のレビュー）", () => {
  test("絵文字の名前も、保存した後に読み直せる", () => {
    const name = "😂".repeat(MAX_NAME);
    const r = saveFilter([], name, f({ q: ["w"] }), []);
    expect(r.ok).toBe(true);
    expect(r.ok && parseSaved(JSON.stringify(r.list)).map((s) => s.name)).toEqual([name]);
  });

  test("上書きは元の中身に戻せる", () => {
    const first = saveFilter([], "a", f({ q: ["old"] }), []);
    if (!first.ok) throw new Error();
    const second = saveFilter(first.list, "a", f({ q: ["new"] }), []);
    if (!second.ok || !second.replaced) throw new Error();
    expect(undoOverwrite(second.list, second.replaced, second.index)[0].filter.q).toEqual(["old"]);
  });

  test("読めない形・多すぎる重ねる言葉・長すぎる語の行は読まない", () => {
    const rows = [
      { name: "re", filter: { re: ["("] } },
      { name: "lines", filter: {}, terms: ["a", "b", "c"] },
      { name: "long", filter: { q: ["あ".repeat(101)] } },
      { name: "ok", filter: { re: ["^\\d+$"] } },
    ];
    expect(parseSaved(JSON.stringify(rows)).map((s) => s.name)).toEqual(["ok"]);
  });
});
