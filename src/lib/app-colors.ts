// CSS の変数を使えない所（マニフェスト・端末の上の帯の色・アイコンの PNG・SNS の絵）のための色（#70・#68）。
// 値は src/app/globals.css の変数と同じにする（tests/app-colors.test.ts で確かめる）。ここ以外に色を書かない。
export const APP_COLORS = {
  light: {
    bg: "#f6f8fb", // design-lint: allow --bg（CSS の変数が使えない所のため）
    surface: "#ffffff", // design-lint: allow --surface
    accent: "#2c5a96", // design-lint: allow --accent
    accentWeak: "#e3ecf7", // design-lint: allow --accent-weak
    // 共有リンクの SNS の絵（#68）
    text: "#1b2430", // design-lint: allow --text
    muted: "#566373", // design-lint: allow --muted
    line: "#d5dde8", // design-lint: allow --line
    chart1: "#78a8e8", // design-lint: allow --chart-1
  },
  dark: {
    surface: "#17212d", // design-lint: allow --surface（ダーク）
  },
} as const;
