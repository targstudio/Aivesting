import Link from "next/link";
import { AiInsight } from "@/app/components/AiInsight";
import { AssetLogo } from "@/app/components/AssetLogo";
import { ScenarioCard } from "@/app/components/ScenarioCard";
import { Breadcrumbs, Card, EmptyState, InfoBanner, PageTitle, Segmented } from "@/app/components/ui";
import { getHorizon, HORIZONS, type AssetClass, type Horizon, type HorizonRanking } from "@/lib/api";
import { formatProbability, formatRatio } from "@/lib/format";

export const dynamic = "force-dynamic";

const plural = (y: number) => (y === 1 ? "1 ano" : `${y} anos`);

function ModelNote({ data }: { data: HorizonRanking }) {
  const v = data.beat_benchmark.validation;
  const classLabel = data.asset_class === "fiis" ? "os FIIs" : "as ações";
  if (!data.enough_history) {
    return (
      <p>
        <strong>Histórico insuficiente para {plural(data.years)}.</strong> A maioria d{classLabel} do app negocia há
        poucos anos, então ainda não há janelas de {plural(data.years)} suficientes para estimar uma probabilidade. A ordem
        segue o retorno ajustado ao risco dos últimos 10 anos.
      </p>
    );
  }
  if (data.model_used) {
    return (
      <p>
        <strong>Modelo validado fora da amostra.</strong> Testado ano a ano só com dados que existiam na época: entre os
        30% de maior probabilidade, {formatProbability(v.hit_rate_top ?? 0)} superaram o {data.benchmark} em{" "}
        {plural(data.years)}; entre os 30% de menor, {formatProbability(v.hit_rate_bottom ?? 0)}.
      </p>
    );
  }
  return (
    <p>
      <strong>Nesse horizonte, nenhum fator previu melhor que a média histórica</strong>
      {v.oos_samples ? "" : " (ainda não há janelas suficientes para testar"}
      {v.oos_samples ? "." : ")."} A probabilidade exibida é a frequência com que {classLabel} superaram o{" "}
      {data.benchmark} em janelas de {plural(data.years)} ({formatProbability(data.beat_benchmark.base_rate)}) e a ordem
      segue o retorno ajustado ao risco dos últimos 10 anos (índice de Sharpe contra o CDI).
    </p>
  );
}

export default async function HorizonsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; anos?: string }>;
}) {
  const { classe, anos } = await searchParams;
  const assetClass: AssetClass = classe === "fiis" ? "fiis" : "acoes";
  const years = (HORIZONS.find((h) => String(h) === anos) ?? 1) as Horizon;
  const data = await getHorizon(assetClass, years);
  const href = (c: AssetClass, y: Horizon) => `/horizontes?classe=${c}&anos=${y}`;

  return (
    <>
      <Breadcrumbs items={[{ label: "Horizontes" }]} />
      <PageTitle
        title="Ranking por horizonte"
        subtitle="Chance estimada de cada ativo superar o índice e o CDI em 1, 3, 5 e 10 anos, a partir do histórico desde 2000 (crise de 2008, recessão de 2015-16, pandemia, alta de juros)."
      />
      <InfoBanner>
        {data?.disclaimer ??
          "Probabilidades estimadas por modelo estatístico. Não é recomendação de investimento. Rentabilidade passada não garante rentabilidade futura."}
      </InfoBanner>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { label: "Ações", href: href("acoes", years), active: assetClass === "acoes" },
            { label: "FIIs", href: href("fiis", years), active: assetClass === "fiis" },
          ]}
        />
        <Segmented
          options={HORIZONS.map((h) => ({ label: plural(h), href: href(assetClass, h), active: h === years }))}
        />
      </div>

      {!data ? (
        <EmptyState>O modelo de horizontes ainda não foi calibrado. Verifique se a API está rodando.</EmptyState>
      ) : (
        <>
          <AiInsight
            context={`horizontes:${assetClass}:${years}`}
            title={`O horizonte de ${plural(years)} explicado pela IA`}
            askPrompt={`Explique de forma simples o ranking de ${plural(years)} de ${assetClass === "fiis" ? "FIIs" : "ações"}`}
          />
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <ScenarioCard scenario={data.scenario} />
            <Card>
              <h2 className="mb-3 text-lg">Como ler</h2>
              <div className="flex flex-col gap-3 text-sm text-muted">
                <ModelNote data={data} />
                <p>
                  &quot;Retorno típico&quot; é a mediana do retorno anual do ativo em todas as janelas de{" "}
                  {plural(data.years)} desde que ele existe, com a faixa entre os 10% piores e os 10% melhores casos.
                  Dados até {data.data_through}.
                  {data.benchmark_is_proxy && ` Sem o índice oficial na fonte, a referência é a ${data.benchmark}.`}
                </p>
                <p>
                  O universo é formado pelos ativos grandes de hoje. Empresas e fundos que encolheram ou sumiram ficam de
                  fora, então as frequências históricas tendem a ser otimistas.
                </p>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            {data.assets.map((a) => (
              <Link
                key={a.ticker}
                href={`/ativo/${a.ticker}`}
                className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 rounded-3xl border border-border bg-surface px-4 py-4 transition-colors hover:bg-track/40 md:grid-cols-[2rem_1fr_8rem_8rem_11rem_6rem] md:px-6"
              >
                <span className="tabular text-center text-sm font-bold text-muted">{a.rank}º</span>
                <span className="flex min-w-0 items-center gap-3">
                  <AssetLogo ticker={a.ticker} src={a.logo_url} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{a.ticker}</span>
                    <span className="block truncate text-sm text-muted">{a.name}</span>
                  </span>
                </span>
                <span className="text-right md:text-left">
                  <span className="block text-xs text-muted">
                    Prob. vs <span className="md:hidden">índice</span>
                    <span className="hidden md:inline">{data.benchmark}</span>
                  </span>
                  <span className="tabular block font-bold text-accent-text">{formatProbability(a.prob_beat_benchmark)}</span>
                </span>
                <span className="hidden md:block">
                  <span className="block text-xs text-muted">Prob. vs CDI</span>
                  <span className="tabular block font-semibold">{formatProbability(a.prob_beat_cdi)}</span>
                </span>
                <span className="hidden md:block">
                  <span className="block text-xs text-muted">Retorno típico ao ano</span>
                  {a.history ? (
                    <span className="tabular block">
                      {formatRatio(a.history.median)}{" "}
                      <span className="text-xs text-muted">
                        ({formatRatio(a.history.p10)} a {formatRatio(a.history.p90)})
                      </span>
                    </span>
                  ) : (
                    <span className="block text-sm text-muted">pouco histórico</span>
                  )}
                </span>
                <span className="hidden md:block">
                  <span className="block text-xs text-muted">Sharpe 10a</span>
                  <span className="tabular block">{a.sharpe_10y?.toLocaleString("pt-BR") ?? "–"}</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
