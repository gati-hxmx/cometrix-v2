import Link from "next/link";
import { currentUser } from "../auth/current";
import { isLoginConfigured } from "../auth/google";
import { ThemeToggle } from "./ThemeToggle";

const headerButton = {
  minHeight: 44,
  minWidth: 44,
  padding: "0 14px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  textDecoration: "none",
  whiteSpace: "nowrap",
} as const;

/**
 * 画面の一番上。左にロゴ（トップへの入口）、右に［ログイン］か［マイページ］（#7）と明るい／暗いの切り替え。
 * ログインの設定（GOOGLE_CLIENT_ID など）がないときは［ログイン］を出さない。
 */
export async function Header() {
  const user = await currentUser();
  const showLogin = !user && isLoginConfigured();
  return (
    <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 16px",
          minHeight: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Link
          href="/"
          aria-label="Cometrix トップへ"
          style={{
            color: "var(--accent-dark)",
            fontWeight: 700,
            fontSize: 18,
            textDecoration: "none",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
          }}
        >
          Cometrix
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user ? (
            <Link href="/me" style={headerButton}>
              マイページ
            </Link>
          ) : (
            showLogin && (
              <Link href="/login" style={headerButton}>
                ログイン
              </Link>
            )
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
