import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { APP_COLORS } from "../src/lib/app-colors";

// マニフェストやアイコンの色が、画面の配色（globals.css）とずれないように（#70）。
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const blocks = css.split(/@media|\[data-theme/);
const token = (block: string, name: string) =>
  block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1]?.toLowerCase();

test("ライトの色は globals.css の最初の変数と同じ", () => {
  const light = blocks[0];
  expect(token(light, "bg")).toBe(APP_COLORS.light.bg);
  expect(token(light, "surface")).toBe(APP_COLORS.light.surface);
  expect(token(light, "accent")).toBe(APP_COLORS.light.accent);
  expect(token(light, "accent-weak")).toBe(APP_COLORS.light.accentWeak);
});

test("ダークの地の色は globals.css のダークの変数と同じ", () => {
  expect(blocks.slice(1).some((b) => token(b, "surface") === APP_COLORS.dark.surface)).toBe(true);
});
