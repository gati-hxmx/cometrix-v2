/** ダークモードの選択。保存先は localStorage の cometrix-theme（light / dark）。 */
export const THEME_KEY = "cometrix-theme";
export type Theme = "light" | "dark";

export function parseTheme(v: string | null | undefined): Theme | null {
  return v === "light" || v === "dark" ? v : null;
}

/** 保存した選択があればそれ、なければ OS の設定に従う。 */
export function resolveTheme(saved: string | null | undefined, prefersDark: boolean): Theme {
  return parseTheme(saved) ?? (prefersDark ? "dark" : "light");
}

/** 画面が出る前に実行する文字列（明るい画面が一瞬光らないように）。保存が使えなくても壊れない。 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=null;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;
