import { describe, expect, test } from "vitest";
import { isLaugh } from "../src/lib/laugh";
import { LAUGHS, NOT_LAUGHS } from "./fixtures/laugh-samples";

describe("isLaugh", () => {
  test.each(LAUGHS)("笑い：%s", (text) => {
    expect(isLaugh(text)).toBe(true);
  });
  test.each(NOT_LAUGHS)("笑いでない：%s", (text) => {
    expect(isLaugh(text)).toBe(false);
  });
});
