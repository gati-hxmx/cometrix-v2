import Link from "next/link";

/** 画面の一番上。左にロゴ（トップへの入口）。トップと分析画面で共通。 */
export function Header() {
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
      </div>
    </header>
  );
}
