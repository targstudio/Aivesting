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
      <Breadcrumbs items={[{ label: "Ranking" }]} />
      <PageTitle
        title={`Ranking de ${label.toLowerCase()}`}
        subtitle={`Probabilidade estimada de cada ativo superar o ${snapshot?.benchmark ?? "índice"}.`}
      />
      <InfoBanner>
        Modelo {snapshot?.model_version ?? "baseline"}: combina momentum, tendência, volatilidade e volume. Ainda não
        calibrado com histórico; trate as probabilidades como estimativas. Não é recomendação de investimento.
      </InfoBanner>

      <AiInsight
        context={`ranking:${assetClass}`}
        title={`O que o ranking de ${label.toLowerCase()} mostra`}
        askPrompt={`O que os primeiros do ranking de ${label.toLowerCase()} têm em comum?`}
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
        <EmptyState>Ranking ainda não calculado. Verifique se a API está rodando.</EmptyState>
      )}
    </>
  );
}
