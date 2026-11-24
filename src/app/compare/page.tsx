import type { Metadata } from "next";
import { CompareView } from "../../components/CompareView";
import { Header } from "../../components/Header";
import { parseCompare } from "../../lib/compare";

export const metadata: Metadata = { title: "コラボを重ねて比べる" };

/** コラボを重ねて比べる（#63）。?ids=分析の ID,…&adj=秒,… */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const k of ["ids", "adj"]) {
    const v = sp[k];
    if (typeof v === "string") p.set(k, v);
  }
  return (
    <>
      <Header />
      <CompareView initial={parseCompare(p)} />
    </>
  );
}
