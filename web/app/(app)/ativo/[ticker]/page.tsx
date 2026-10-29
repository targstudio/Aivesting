import { notFound } from "next/navigation";
import { AssetActions } from "@/app/components/AssetActions";
import { AssetHistorySection } from "@/app/components/AssetHistory";
import { AssetLogo } from "@/app/components/AssetLogo";
import { DividendsCard } from "@/app/components/DividendsCard";
import { FundamentalsCard } from "@/app/components/FundamentalsCard";
import { Term } from "@/app/components/Term";
import { AreaChart } from "@/app/components/charts";
import { ExplainButton } from "@/app/components/ExplainButton";
import { SwotAnalysis } from "@/app/components/SwotAnalysis";
import { Breadcrumbs, Card, CardHeader, InfoBanner, PageTitle, Stat } from "@/app/components/ui";
import { getAsset, getAssetDividends, getAssetHistory, getB3Quote, getFundamentals, type B3Quote } from "@/lib/api";
import { changeColor, formatBRL, formatNumber, formatPercent, formatProbability, formatTime } from "@/lib/format";

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const [detail, history, dividends, fundamentals] = await Promise.all([
    getAsset(ticker),
    getAssetHistory(ticker),
    getAssetDividends(ticker),
    getFundamentals(ticker),
  ]);
  // Fora do ranking: cotação sob demanda de qualquer ativo da B3.
  const quote = detail ? null : await getB3Quote(ticker);
  if (!detail && !history && !quote) notFound();
  const head = detail?.asset ?? history ?? quote!;
  const crumb = { label: "Melhores", href: detail?.asset.asset_class === "fiis" ? "/ranking?classe=fiis" : "/ranking" };

  return (
    <>
      <Breadcrumbs items={[crumb, { label: head.ticker }]} />
      <div className="flex items-center gap-4">
        <AssetLogo ticker={head.ticker} src={head.logo_url} size={64} />
        <PageTitle title={head.ticker} subtitle={head.name} />
      </div>
      <AssetActions ticker={head.ticker} />
      <InfoBanner>{detail?.disclaimer ?? quote?.disclaimer ?? history!.disclaimer}</InfoBanner>
      {detail && <LiveSection detail={detail} />}
      {quote && <QuoteSection quote={quote} />}
      {fundamentals && <FundamentalsCard f={fundamentals} isFii={(detail?.asset ?? history)?.asset_class === "fiis" || quote?.type === "fii"} />}
      {dividends && <DividendsCard d={dividends} />}
      {(detail || history) && <SwotAnalysis ticker={head.ticker} />}
      {history && <AssetHistorySection h={history} />}
    </>
  );
}

function LiveSection({ detail }: { detail: NonNullable<Awaited<ReturnType<typeof getAsset>>> }) {
  const { asset } = detail;
  return (
    <>
      <h2 className="mb-3 text-lg font-bold">Agora · atualizado a cada 5 minutos</h2>

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-6 md:flex md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-8">
            <Stat value={formatBRL(asset.price)} label="Preço" accent sub={detail.data_realtime ? "tempo real" : "com atraso"} />
          </div>
          <div className="md:px-8">
            <Stat value={formatPercent(asset.change_percent)} label="Quanto mudou hoje" />
          </div>
          <div className="md:px-8">
            <Stat value={`${asset.rank}º de ${detail.total}`} label="Posição na lista" sub={<>nota {formatNumber(asset.score)} de 100</>} />
          </div>
          <div className="md:px-8">
            <Stat
              value={formatProbability(asset.probability_outperform)}
              label={<Term k="probabilidade">Chance de render mais que a bolsa</Term>}
              sub={`atualizado às ${formatTime(detail.computed_at)}`}
            />
          </div>
        </div>
      </Card>

      {asset.spark?.length > 1 && (
        <Card className="mb-6">
          <CardHeader
            title="Preço"
            subtitle="Últimos 30 dias de bolsa"
            value={<span className={changeColor(asset.spark[asset.spark.length - 1] / asset.spark[0] - 1)}>{formatPercent((asset.spark[asset.spark.length - 1] / asset.spark[0] - 1) * 100)}</span>}
          />
          <AreaChart values={asset.spark} prefix="R$ " color="var(--chart-2)" />
        </Card>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg">O que mais pesou na nota</h2>
          <ul className="flex flex-col divide-y divide-border">
            {asset.top_factors.map((f) => (
              <li key={f.factor} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{f.label}</span>
                <span className={`tabular ${changeColor(f.contribution)}`}>
                  {f.contribution > 0 ? "+" : ""}
                  {f.contribution.toFixed(2).replace(".", ",")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Quanto cada ponto ajudou ou atrapalhou a nota.</p>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg">Análise da IA</h2>
          <p className="mb-4 text-sm text-muted">
            A IA explica em palavras simples por que este investimento está nessa posição.
          </p>
          <ExplainButton ticker={asset.ticker} />
        </Card>
      </div>
    </>
  );
}

function QuoteSection({ quote }: { quote: B3Quote }) {
  const spark = quote.spark ?? [];
  const asOf = quote.as_of
    ? quote.live
      ? `às ${formatTime(quote.as_of)}`
      : `fechamento de ${new Date(`${quote.as_of}T12:00:00`).toLocaleDateString("pt-BR")}`
    : undefined;
  return (
    <>
      <h2 className="mb-3 text-lg font-bold">Cotação</h2>
      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-6 md:flex md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-8">
            <Stat value={formatBRL(quote.price)} label="Preço" accent sub={quote.live ? "com atraso" : "último dia de bolsa"} />
          </div>
          <div className="md:px-8">
            <Stat
              value={quote.change_percent != null ? formatPercent(quote.change_percent) : "–"}
              label="Quanto mudou hoje"
              sub={asOf}
            />
          </div>
          {quote.type_label && (
            <div className="md:px-8">
              <Stat value={quote.type_label} label="Tipo" sub={quote.spec} />
            </div>
          )}
        </div>
      </Card>

      {spark.length > 1 && (
        <Card className="mb-6">
          <CardHeader
            title="Preço"
            subtitle="Últimos 30 dias de bolsa"
            value={<span className={changeColor(spark[spark.length - 1] / spark[0] - 1)}>{formatPercent((spark[spark.length - 1] / spark[0] - 1) * 100)}</span>}
          />
          <AreaChart values={spark} prefix="R$ " color="var(--chart-2)" />
        </Card>
      )}

      <Card className="mb-6 text-sm text-muted">
        Este investimento não está na lista de melhores, que cobre só os mais negociados. Você ainda pode perguntar à
        IA sobre ele ou criar um alerta.
      </Card>
    </>
  );
}
