// トップ。形は docs/screens/top.md（最小：見出しと URL 入力欄）。分析の実行は #3・#4 以降。
export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>URL を入れて分析</h1>
      <form style={{ display: "flex", gap: 8 }}>
        <input
          type="url"
          name="url"
          aria-label="配信の URL"
          placeholder="https://www.youtube.com/watch?v=..."
          style={{
            flex: 1,
            minHeight: 44,
            padding: "0 12px",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          aria-label="分析する"
          style={{
            minWidth: 44,
            minHeight: 44,
            padding: "0 16px",
            border: 0,
            borderRadius: "var(--radius)",
            background: "var(--accent)",
            color: "#fff",
          }}
        >
          分析
        </button>
      </form>
    </main>
  );
}
