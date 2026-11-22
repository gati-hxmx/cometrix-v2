import { Header } from "../components/Header";
import { UrlForm } from "../components/UrlForm";
import { sharedUrl } from "../lib/share";

// トップ。形は docs/screens/top.md（案 B）。最近の分析の一覧は保存の仕組みができる #8 以降。
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ほかのアプリの「共有」から来たとき（#70）は、受け取った URL を入力欄に入れておく
  const shared = sharedUrl(await searchParams);
  return (
    <>
      <Header />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px" }}>
        <h1 style={{ fontSize: 24, margin: "0 0 16px" }}>URL を入れて分析</h1>
        {/* key：ヘッダーのリンクで / に戻ったとき、前に受け取った URL を残さない */}
        <UrlForm key={shared ?? ""} autoFocus initial={shared ?? undefined} />
      </main>
    </>
  );
}
