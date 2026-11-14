import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import "./globals.css";

export const metadata = { title: "Cometrix" };

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
