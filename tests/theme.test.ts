import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme } from "../src/lib/theme";

const css = readFileSync("src/app/globals.css", "utf8");

function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const darkOnly = vars(css.match(/html\[data-theme="dark"\] \{[^}]*\}/)?.[0] ?? "");
const light = vars(css.match(/:root \{[^}]*\}/)?.[0] ?? "");
const dark = { ...light, ...darkOnly };

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [文字, 地]
const PAIRS: [string, string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface-2"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent-dark", "surface"],
  ["accent-dark", "accent-weak"],
  ["on-accent", "accent"],
  ["warn", "warn-weak"],
  ["danger", "danger-weak"],
  ["danger", "surface"],
  ["ok", "ok-weak"],
  ["chart-1-text", "chart-1-weak"],
  ["sat", "surface"],
];

describe("配色のコントラスト（本文・補足は 4.5:1 以上）", () => {
  for (const [name, set] of [
    ["ライト", light],
    ["ダーク", dark],
  ] as const) {
    for (const [fg, bg] of PAIRS) {
      it(`${name}：${fg} / ${bg}`, () => {
        expect(set[fg], `--${fg}`).toBeDefined();
        expect(set[bg], `--${bg}`).toBeDefined();
        expect(ratio(set[fg], set[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("ダークはライトと同じ変数をすべて持つ", () => {
    for (const k of Object.keys(light)) expect(darkOnly[k], `--${k}`).toBeDefined();
  });
});

describe("テーマの選び方", () => {
  it("保存した選択が OS の設定より先", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("保存がなければ OS の設定、壊れた値も無視", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("x", false)).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme(undefined)).toBeNull();
  });
});
