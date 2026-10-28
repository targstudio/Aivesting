import Link from "next/link";
import { getRanking, type AssetClass } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { RankingList } from "../components/RankingList";
import { Breadcrumbs, EmptyState, InfoBanner, PageTitle } from "../components/ui";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ classe?: string }> }) {
  const { classe } = await searchParams;
  const assetClass: AssetClass = classe === "fiis" ? "fiis" : "acoes";
  const snapshot = await getRanking(assetClass);
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

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded border border-border bg-surface p-1 text-sm">
          {(["acoes", "fiis"] as const).map((c) => (
            <Link
              key={c}
              href={c === "fiis" ? "/ranking?classe=fiis" : "/ranking"}
              className={`rounded px-4 py-1.5 ${c === assetClass ? "bg-primary text-white" : "hover:bg-nav-active"}`}
            >
              {c === "fiis" ? "FIIs" : "Ações"}
            </Link>
          ))}
        </div>
        {snapshot && <span className="text-sm text-muted">Atualizado às {formatTime(snapshot.computed_at)}</span>}
      </div>

      {snapshot && snapshot.assets.length ? (
        <RankingList assets={snapshot.assets} benchmark={snapshot.benchmark} />
      ) : (
        <EmptyState>Ranking ainda não calculado. Verifique se a API está rodando.</EmptyState>
      )}
    </>
  );
}
