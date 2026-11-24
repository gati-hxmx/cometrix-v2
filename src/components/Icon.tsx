// 線のアイコン（docs/design/icons.md）。絵は Lucide（ISC ライセンス）の形をそのまま使う。
// 新しい意味を足すときは、先に icons.md の一覧に1行足す。
const PATHS = {
  // 書き出し（CSV など）
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </>
  ),
  // コピー
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  // 共有リンク（#68）
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  // 共有をやめる（#68）
  "link-2-off": (
    <>
      <path d="M9 17H7A5 5 0 0 1 7 7" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" x2="12" y1="12" y2="12" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </>
  ),
  // 見どころ再生を始める（#61）
  play: <polygon points="6 3 20 12 6 21 6 3" />,
  // 見どころ再生を止める（#61）
  square: <rect width="14" height="14" x="5" y="5" rx="2" />,
  // 選ぶメニューを開く（#61）
  "chevron-down": <path d="m6 9 6 6 6-6" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      {PATHS[name]}
    </svg>
  );
}
