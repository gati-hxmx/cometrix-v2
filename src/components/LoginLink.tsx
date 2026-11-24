"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

/** ヘッダーの［ログイン］（#7）。今見ている画面を next に入れ、ログインのあとにそこへ戻る */
export function LoginLink({ style }: { style: CSSProperties }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const here = query ? `${path}?${query}` : path;
  const href =
    here && here !== "/" && !here.startsWith("/login")
      ? `/login?next=${encodeURIComponent(here)}`
      : "/login";
  return (
    <Link href={href} style={style}>
      ログイン
    </Link>
  );
}
