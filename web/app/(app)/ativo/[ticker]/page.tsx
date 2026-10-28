import { notFound } from "next/navigation";
import { ExplainButton } from "@/app/components/ExplainButton";
import { Breadcrumbs, Card, InfoBanner, PageTitle, Stat } from "@/app/components/ui";
import { getAsset } from "@/lib/api";
import { changeColor, formatBRL, formatPercent, formatProbability, formatTime } from "@/lib/format";

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const detail = await getAsset(ticker);
  if (!detail) notFound();
  const { asset } = detail;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Ranking", href: asset.asset_class === "fiis" ? "/ranking?classe=fiis" : "/ranking" },
          { label: asset.ticker },
        ]}
      />
      <PageTitle title={`${asset.ticker}`} subtitle={asset.name} />
      <InfoBanner>{detail.disclaimer}</InfoBanner>

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-6 md:flex md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-8">
            <Stat value={formatBRL(asset.price)} label="Preço" accent sub={detail.data_realtime ? "tempo real" : "com atraso"} />
          </div>
          <div className="md:px-8">
            <Stat value={formatPercent(asset.change_percent)} label="Variação no dia" />
          </div>
          <div className="md:px-8">
            <Stat value={`${asset.rank}º de ${detail.total}`} label="Posição no ranking" sub={`score ${asset.score}/100`} />
          </div>
          <div className="md:px-8">
            <Stat
              value={formatProbability(asset.probability_outperform)}
              label={`Prob. de superar o ${detail.benchmark}`}
              sub={`atualizado às ${formatTime(detail.computed_at)}`}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg">Fatores que mais pesaram</h2>
          <ul className="flex flex-col divide-y divide-border">
            {asset.top_factors.map((f) => (
              <li key={f.factor} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{f.label}</span>
                <span className={`tabular ${changeColor(f.contribution)}`}>
                  {f.contribution > 0 ? "+" : ""}
                  {f.contribution.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Contribuição de cada fator para o score (modelo {detail.model_version}).</p>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg">Análise da IA</h2>
          <p className="mb-4 text-sm text-muted">
            A IA explica o ranking a partir dos números calculados e dos indicadores macro, sem recomendar compra ou venda.
          </p>
          <ExplainButton ticker={asset.ticker} />
        </Card>
      </div>
    </>
  );
}
