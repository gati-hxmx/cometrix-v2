import { describe, expect, it } from "vitest";
import { averagePerBucket, parseStepSec, seekTarget } from "../src/lib/playback";

describe("averagePerBucket", () => {
  it("区間が0のときは 0", () => {
    expect(averagePerBucket(0, 0)).toBe(0);
    expect(averagePerBucket(5, 0)).toBe(0);
  });
  it("1区間はそのまま", () => expect(averagePerBucket(7, 1)).toBe(7));
  it("小数第1位に丸める", () => {
    expect(averagePerBucket(100, 3)).toBe(33.3);
    expect(averagePerBucket(2, 3)).toBe(0.7);
    expect(averagePerBucket(10, 4)).toBe(2.5);
  });
});

describe("seekTarget", () => {
  it("前後に動かす", () => {
    expect(seekTarget(100, 10)).toBe(110);
    expect(seekTarget(100, -10)).toBe(90);
  });
  it("0 未満にならない", () => expect(seekTarget(5, -10)).toBe(0));
  it("小数の位置は切り捨てる", () => expect(seekTarget(100.9, 10)).toBe(110));
});

describe("parseStepSec", () => {
  it("1〜3600 の整数は通る", () => {
    expect(parseStepSec("10")).toBe(10);
    expect(parseStepSec("1")).toBe(1);
    expect(parseStepSec("3600")).toBe(3600);
  });
  it.each(["", " ", "0", "-5", "1.5", "3601", "abc", "1e2", "１０"])("%j は null", (t) => {
    expect(parseStepSec(t)).toBeNull();
  });
});
