import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Header } from "../../../components/Header";
import { ShareView } from "../../../components/ShareView";
import { requestOrigin } from "../../../lib/origin";
import { loadSharedCached } from "../../../lib/share-page";
import { parseStartSec } from "../../../lib/share-url";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// 共有ページ（#68）。SNS に貼ったときの絵は同じ場所の opengraph-image.tsx。
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const shared = await loadSharedCached(token);
  if (!shared) return { title: "Cometrix", robots: { index: false } };
  // SNS の絵の URL を、外から見えるホストの絶対 URL にする（無いと localhost になる）
  const origin = requestOrigin(await headers());
  const description = `コメント ${shared.totalComments.toLocaleString("ja-JP")} 件から、盛り上がった場面を見つけました`;
  return {
    metadataBase: new URL(origin),
    title: `${shared.title} | Cometrix`,
    description,
    // 共有した人だけが知る URL なので、検索には出さない（SNS の絵は出る）
    robots: { index: false, follow: false },
    openGraph: {
      title: shared.title,
      description,
      type: "website",
      siteName: "Cometrix",
      url: `/s/${token}`,
    },
    twitter: { card: "summary_large_image", title: shared.title, description },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { token } = await params;
  const shared = await loadSharedCached(token);
  if (!shared) notFound();
  const startSec = parseStartSec((await searchParams).t);
  return (
    <>
      <Header />
      <ShareView token={token} startSec={startSec} {...shared} />
    </>
  );
}
