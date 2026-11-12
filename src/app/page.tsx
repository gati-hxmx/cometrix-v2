import { Header } from "../components/Header";
import { UrlForm } from "../components/UrlForm";

// トップ。形は docs/screens/top.md（案 B）。最近の分析の一覧は保存の仕組みができる #8 以降。
export default function Home() {
  return (
    <>
      <Header />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px" }}>
        <h1 style={{ fontSize: 24, margin: "0 0 16px" }}>URL を入れて分析</h1>
        <UrlForm autoFocus />
      </main>
    </>
  );
}
