import { describe, expect, test } from "vitest";
import { DEFAULT_PURGE_DAYS, parsePurgeDays } from "../src/lib/purge";

describe("parsePurgeDays", () => {
  test("未設定・空は既定の90日", () => {
    expect(parsePurgeDays(undefined)).toBe(DEFAULT_PURGE_DAYS);
    expect(parsePurgeDays("")).toBe(90);
    expect(parsePurgeDays("  ")).toBe(90);
  });
  test("1以上の整数はそのまま", () => {
    expect(parsePurgeDays("1")).toBe(1);
    expect(parsePurgeDays("30")).toBe(30);
  });
  test("0・負・小数・数字以外は null（掃除しない）", () => {
    for (const v of ["0", "-5", "1.5", "abc", "10d", "1e3"]) expect(parsePurgeDays(v)).toBeNull();
  });
});
