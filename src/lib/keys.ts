// 分析画面のキー操作（#66）。PC でたくさん見る人の手間を減らす。
// ← → 前後の山、スペース 再生・停止、J / L 10秒戻る・進む、M メモに今の時刻。

export type KeyAction = "prev" | "next" | "toggle" | "back" | "forward" | "stamp";

export const SKIP_SEC = 10;

/** キーを押した場所。文字を打っている所・押せる物の上では、ふだんの動きを邪魔しない。 */
export type KeyTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  role?: string | null;
  /** グラフの棒の入れ物の中（← → はグラフが自分で使う） */
  inChart?: boolean;
};

export type KeyInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
};

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const PRESSABLE = new Set(["BUTTON", "A", "SUMMARY"]);
const PRESSABLE_ROLES = new Set([
  "button",
  "radio",
  "tab",
  "menuitem",
  "checkbox",
  "switch",
  "link",
]);

/** 押されたキーを操作にする。分析画面の操作でなければ null（ブラウザのふだんの動きのまま）。 */
export function keyAction(e: KeyInput, t: KeyTarget): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (t.isContentEditable || (t.tagName && TYPING.has(t.tagName))) return null;
  // 開いたメニューの中では、キーはメニューの操作に使う（書き出しの ⋮、#59）
  if (t.role === "menuitem") return null;
  const onPressable =
    (t.tagName !== undefined && PRESSABLE.has(t.tagName)) ||
    (t.role != null && PRESSABLE_ROLES.has(t.role));
  switch (e.key) {
    case "ArrowLeft":
    case "ArrowRight":
      // グラフの中・札の切り替え（radio・tab）の中では、矢印はそちらの動きに使う
      if (t.inChart || t.role === "radio" || t.role === "tab") return null;
      return e.key === "ArrowLeft" ? "prev" : "next";
    case " ":
    case "Spacebar":
      // ボタンの上のスペースはボタンを押す動き
      if (onPressable || e.repeat) return null;
      return "toggle";
    case "j":
    case "J":
      return "back";
    case "l":
    case "L":
      return "forward";
    case "m":
    case "M":
      return e.repeat ? null : "stamp";
    default:
      return null;
  }
}

/**
 * 次・前の山の時刻。peaks は山の開始秒（並びは問わない）。
 * 前へは、今いる山の頭から少し（3秒）過ぎていれば同じ山の頭へ戻らず1つ前へ行く。なければ null。
 */
export function stepPeak(peaks: number[], now: number, dir: 1 | -1): number | null {
  const sorted = [...peaks].sort((a, b) => a - b);
  if (dir === 1) return sorted.find((s) => s > now + 1) ?? null;
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i] < now - 3) return sorted[i];
  return null;
}
