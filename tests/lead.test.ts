import { describe, expect, it } from "vitest";
import { LEAD_DEFAULT, leadTarget, parseLead } from "../src/lib/lead";

describe("leadTarget", () => {
  it("開始時刻の N 秒前", () => {
    expect(leadTarget(120, 20)).toBe(100);
    expect(leadTarget(120, 0)).toBe(120);
    expect(leadTarget(120, 30)).toBe(90);
  });
  it("0 秒より前にはならない", () => {
    expect(leadTarget(10, 20)).toBe(0);
    expect(leadTarget(0, 30)).toBe(0);
  });
});

describe("parseLead", () => {
  it("初期は 20 秒", () => expect(LEAD_DEFAULT).toBe(20));
  it.each(["0", "10", "20", "30"])("%s は通る", (t) => expect(parseLead(t)).toBe(Number(t)));
  it.each([null, undefined, "", "15", "-10", "abc", "20.5", "１０"])("%j は初期値", (t) =>
    expect(parseLead(t)).toBe(20),
  );
});
