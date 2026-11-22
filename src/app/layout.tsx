import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_COLORS } from "../lib/app-colors";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cometrix",
  // ホーム画面のアイコン（#70）。マニフェストは app/manifest.ts
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Cometrix", statusBarStyle: "default" },
};

// 端末の上の帯の色。ヘッダーの地（--surface）と同じ。
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_COLORS.light.surface },
    { media: "(prefers-color-scheme: dark)", color: APP_COLORS.dark.surface },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 画面が出る前に保存した配色を当てる（明るい画面が一瞬光らないように） */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 固定の文字列（ユーザー入力を含まない） */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
