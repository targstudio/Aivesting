import { getDividendYields, getRanking, type AssetClass } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { AiInsight } from "@/app/components/AiInsight";
import { RankingList } from "@/app/components/RankingList";
import { Breadcrumbs, EmptyState, InfoBanner, PageTitle, Segmented } from "@/app/components/ui";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ classe?: string }> }) {
  const { classe } = await searchParams;
  const assetClass: AssetClass = classe === "fiis" ? "fiis" : "acoes";
  const snapshot = await getRanking(assetClass);
  const yields = await getDividendYields(snapshot?.assets.map((a) => a.ticker) ?? []);
  const label = assetClass === "fiis" ? "Fundos imobiliários" : "Ações";

  return (
    <>
      <Breadcrumbs items={[{ label: "Melhores" }]} />
      <PageTitle
        title={`Melhores ${label.toLowerCase()} agora`}
        subtitle={`Chance de cada um render mais que a média da bolsa (${snapshot?.benchmark ?? "índice"}) no curto prazo.`}
      />
      <InfoBanner>
        A lista olha como o preço de cada um vem se comportando: se vem subindo, se oscila muito e se tem muita gente
        comprando. É uma estimativa, não uma certeza, e não é recomendação de investimento.
      </InfoBanner>

      <AiInsight
        context={`ranking:${assetClass}`}
        title={`O que essa lista mostra`}
        askPrompt={`Explique de forma simples por que essas ${label.toLowerCase()} estão no topo da lista`}
      />

      <div className="mb-4 flex items-center justify-between">
        <Segmented
          options={[
            { label: "Ações", href: "/ranking", active: assetClass === "acoes" },
            { label: "FIIs", href: "/ranking?classe=fiis", active: assetClass === "fiis" },
          ]}
        />
        {snapshot && <span className="text-sm text-muted">Atualizado às {formatTime(snapshot.computed_at)}</span>}
      </div>

      {snapshot && snapshot.assets.length ? (
        <RankingList assets={snapshot.assets} benchmark={snapshot.benchmark} yields={yields} />
      ) : (
        <EmptyState>A lista ainda está sendo preparada. Tente de novo em alguns minutos.</EmptyState>
      )}
    </>
  );
}
