import { AnalysisView } from "../../../components/AnalysisView";
import { Header } from "../../../components/Header";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Header />
      <AnalysisView id={id} />
    </>
  );
}
