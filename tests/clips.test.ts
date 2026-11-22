import { describe, expect, it } from "vitest";
import {
  addClip,
  CLIP_MAX,
  CLIP_NAME_MAX,
  clipLabel,
  formatClock,
  normalizeRange,
  parseClips,
  parseClock,
  rangeError,
  removeClip,
  serializeClips,
  updateClip,
} from "../src/lib/clips";

const c = (id: string, start: number, end: number, name = "") => ({ id, name, start, end });

describe("時刻の読み書き", () => {
  it("m:ss と h:mm:ss を秒にする", () => {
    expect(parseClock("1:23")).toBe(83);
    expect(parseClock(" 1:02:03 ")).toBe(3723);
    expect(parseClock("0:00")).toBe(0);
  });
  it("形が違うものは null", () => {
    for (const t of ["", "abc", "1:2", "1:60", "1:99:00", "-1:00", "1.5"])
      expect(parseClock(t)).toBeNull();
  });
  it("秒を書式にして、読み直すと同じ", () => {
    expect(formatClock(83)).toBe("1:23");
    expect(formatClock(3723)).toBe("1:02:03");
    for (const s of [0, 59, 60, 3599, 3600, 36000]) expect(parseClock(formatClock(s))).toBe(s);
  });
});

describe("範囲の確かめ", () => {
  it("終点が始点以前・不正な値は理由を返す", () => {
    expect(rangeError(10, 10)).toContain("始点より後");
    expect(rangeError(10, 5)).toContain("始点より後");
    expect(rangeError(null, 5)).toContain("1:23");
    expect(rangeError(10, 11)).toBeNull();
  });
  it("なぞった範囲は小さい順にそろえ、0〜上限に丸める", () => {
    expect(normalizeRange(90, 30, 600)).toEqual({ start: 30, end: 90 });
    expect(normalizeRange(-5, 9999, 600)).toEqual({ start: 0, end: 600 });
    expect(normalizeRange(1.9, 2.9, 0)).toEqual({ start: 1, end: 2 });
  });
});

describe("範囲の作成・直す・消す", () => {
  it("追加すると始点の早い順になる", () => {
    const list = addClip([c("a", 100, 200)], c("b", 10, 20)) ?? [];
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("50 件を超えて追加できない", () => {
    let list = [] as ReturnType<typeof parseClips>;
    for (let i = 0; i < CLIP_MAX; i++) list = addClip(list, c(`i${i}`, i, i + 1)) ?? list;
    expect(list).toHaveLength(CLIP_MAX);
    expect(addClip(list, c("x", 0, 1))).toBeNull();
  });
  it("名前は 40 文字まで", () => {
    const long = "あ".repeat(CLIP_NAME_MAX + 10);
    expect(addClip([], c("a", 0, 1, long))?.[0].name).toHaveLength(CLIP_NAME_MAX);
    expect(updateClip([c("a", 0, 1)], "a", { name: long })[0].name).toHaveLength(CLIP_NAME_MAX);
  });
  it("直すと並びが保たれ、ほかの範囲は変わらない", () => {
    const list = updateClip([c("a", 0, 10), c("b", 20, 30)], "a", { start: 40, end: 50 });
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
    expect(list[0]).toEqual(c("b", 20, 30));
  });
  it("消して、保存済みの形から元に戻すと同じ位置に戻る", () => {
    const before = [c("a", 0, 10), c("b", 20, 30)];
    const after = removeClip(before, "a");
    expect(after.map((x) => x.id)).toEqual(["b"]);
    expect(addClip(after, before[0])).toEqual(before);
  });
  it("名前が空なら「範囲 N」", () => {
    expect(clipLabel(c("a", 0, 1), 2)).toBe("範囲 3");
    expect(clipLabel(c("a", 0, 1, "名場面"), 2)).toBe("名場面");
  });
});

describe("保存した値の読み込み", () => {
  it("書いたものをそのまま読める", () => {
    const list = [c("a", 0, 10, "x"), c("b", 20, 30)];
    expect(parseClips(serializeClips(list))).toEqual(list);
  });
  it("壊れた値は空、形の違う要素・重複 id・終点が始点以前のものは捨てる", () => {
    expect(parseClips(null)).toEqual([]);
    expect(parseClips("{oops")).toEqual([]);
    expect(parseClips('{"a":1}')).toEqual([]);
    const raw = JSON.stringify([
      c("a", 0, 10),
      { id: "b", name: 1, start: 0, end: 1 },
      c("a", 5, 6),
      c("z", 10, 10),
      c("n", -1, 5),
      null,
    ]);
    expect(parseClips(raw).map((x) => x.id)).toEqual(["a"]);
  });
});
