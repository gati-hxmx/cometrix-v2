import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "../../auth/current";
import { Header } from "../../components/Header";

export const metadata: Metadata = { title: "マイページ | Cometrix" };

const row = {
  display: "flex",
  gap: 16,
  padding: "12px 0",
  borderTop: "1px solid var(--line)",
  minWidth: 0,
} as const;
const label = { flex: "0 0 7em", color: "var(--muted)" } as const;
const value = { flex: 1, minWidth: 0, overflowWrap: "anywhere" } as const;

/** マイページ（#7）。ログインが必要。分析の履歴は #8 で足す */
export default async function MyPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Fme");
  return (
    <>
      <Header />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>マイページ</h1>
          <dl style={{ margin: 0 }}>
            <div style={row}>
              <dt style={label}>名前</dt>
              <dd style={{ ...value, margin: 0 }}>{user.name || "（なし）"}</dd>
            </div>
            <div style={row}>
              <dt style={label}>メール</dt>
              <dd style={{ ...value, margin: 0 }}>{user.email}</dd>
            </div>
            <div style={row}>
              <dt style={label}>登録日</dt>
              <dd style={{ ...value, margin: 0 }}>
                {user.createdAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
              </dd>
            </div>
          </dl>
          <form method="post" action="/api/auth/logout" style={{ marginTop: 20 }}>
            <button
              type="submit"
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: "0 18px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                background: "var(--surface)",
                color: "var(--text)",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              ログアウト
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
