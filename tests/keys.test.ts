import { describe, expect, test } from "vitest";
import { keyAction, stepPeak } from "../src/lib/keys";

// キー操作（#66）。
describe("キーを操作にする", () => {
  const body = { tagName: "BODY" };
  test("← → スペース J L M", () => {
    expect(keyAction({ key: "ArrowLeft" }, body)).toBe("prev");
    expect(keyAction({ key: "ArrowRight" }, body)).toBe("next");
    expect(keyAction({ key: " " }, body)).toBe("toggle");
    expect(keyAction({ key: "j" }, body)).toBe("back");
    expect(keyAction({ key: "L" }, body)).toBe("forward");
    expect(keyAction({ key: "m" }, body)).toBe("stamp");
    expect(keyAction({ key: "x" }, body)).toBeNull();
  });

  test("文字を打っているときは何もしない", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"])
      expect(keyAction({ key: "m" }, { tagName })).toBeNull();
    expect(keyAction({ key: " " }, { tagName: "DIV", isContentEditable: true })).toBeNull();
  });

  test("開いたメニューの中では何もしない（メニューのキー操作に任せる）", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "l", "m"])
      expect(keyAction({ key }, { tagName: "BUTTON", role: "menuitem" })).toBeNull();
  });

  test("Ctrl・⌘・Alt つきはブラウザの操作のまま", () => {
    expect(keyAction({ key: "ArrowLeft", altKey: true }, body)).toBeNull();
    expect(keyAction({ key: "l", metaKey: true }, body)).toBeNull();
    expect(keyAction({ key: "m", ctrlKey: true }, body)).toBeNull();
  });

  test("ボタンの上のスペース、グラフ・札の中の矢印は、そちらの動きに任せる", () => {
    expect(keyAction({ key: " " }, { tagName: "BUTTON" })).toBeNull();
    expect(keyAction({ key: " " }, { tagName: "DIV", role: "radio" })).toBeNull();
    expect(keyAction({ key: "ArrowRight" }, { tagName: "DIV", inChart: true })).toBeNull();
    expect(keyAction({ key: "ArrowRight" }, { tagName: "BUTTON", role: "tab" })).toBeNull();
    // ボタンの上でも矢印・文字のキーは使える
    expect(keyAction({ key: "ArrowRight" }, { tagName: "BUTTON" })).toBe("next");
    expect(keyAction({ key: "j" }, { tagName: "BUTTON" })).toBe("back");
  });

  test("押しっぱなしのスペース・M はくり返さない", () => {
    // 押しっぱなしのスペースは何もしないが、ページが動かないよう受け止める
    expect(keyAction({ key: " ", repeat: true }, body)).toBe("hold");
    expect(keyAction({ key: "Spacebar" }, body)).toBe("toggle");
    expect(keyAction({ key: "m", repeat: true }, body)).toBeNull();
    expect(keyAction({ key: "ArrowRight", repeat: true }, body)).toBe("next");
  });
});

test("変換中・メニューの項目・リンクの上では使わない", () => {
  expect(keyAction({ key: "m", isComposing: true }, { tagName: "DIV" })).toBeNull();
  for (const role of ["menuitemcheckbox", "menuitemradio"])
    expect(keyAction({ key: "ArrowRight" }, { tagName: "DIV", role })).toBeNull();
  expect(keyAction({ key: " " }, { tagName: "SPAN", role: "link" })).toBeNull();
});

describe("前後の山", () => {
  const peaks = [600, 60, 3600];
  test("次は今より後のいちばん近い山。最後より後なら null", () => {
    expect(stepPeak(peaks, 0, 1)).toBe(60);
    expect(stepPeak(peaks, 60, 1)).toBe(600);
    expect(stepPeak(peaks, 3600, 1)).toBeNull();
  });
  test("前は今より前の山。山の頭を少し過ぎていたら1つ前へ", () => {
    expect(stepPeak(peaks, 700, -1)).toBe(600);
    expect(stepPeak(peaks, 601, -1)).toBe(60);
    expect(stepPeak(peaks, 30, -1)).toBeNull();
  });

  test("山がない・同じ時刻の山が重なるときも動ける", () => {
    expect(stepPeak([], 100, 1)).toBeNull();
    expect(stepPeak([], 100, -1)).toBeNull();
    expect(stepPeak([0, 0, 300], 0, 1)).toBe(300);
    expect(stepPeak([0, 0, 300], 300, -1)).toBe(0);
  });
});
