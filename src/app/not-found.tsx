import Link from "next/link";
import { Header } from "../components/Header";

export const metadata = { title: "ページが見つかりません | Cometrix" };

// 存在しない URL。HTTP 404 で出る（#28）。
export default function NotFound() {
  return (
    <>
      <Header />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>404</p>
        <h1 style={{ fontSize: 24, margin: "8px 0 12px" }}>ページが見つかりません</h1>
        <p style={{ margin: "0 0 24px", color: "var(--muted)" }}>
          URL が間違っているか、ページが移動しました。
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            padding: "0 18px",
            borderRadius: "var(--radius)",
            background: "var(--accent)",
            color: "var(--on-accent)",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          トップへ戻る
        </Link>
      </main>
    </>
  );
}
