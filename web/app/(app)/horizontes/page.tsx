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
        <strong>Ainda não há história suficiente para {plural(data.years)}.</strong> A maioria d{classLabel} do app existe na bolsa há
        poucos anos, então não dá para calcular a chance com segurança. A ordem segue quem rendeu mais nos últimos 10 anos
        sem sustos grandes demais.
      </p>
    );
  }
  if (data.model_used) {
    return (
      <p>
        <strong>Conta testada no passado.</strong> Simulamos ano a ano como se estivéssemos naquela época: entre os
        30% com mais chance, {formatProbability(v.hit_rate_top ?? 0)} renderam mais que o {data.benchmark} em{" "}
        {plural(data.years)}; entre os 30% com menos chance, {formatProbability(v.hit_rate_bottom ?? 0)}.
      </p>
    );
  }
  return (
    <p>
      <strong>Para esse prazo, nenhuma conta previu melhor do que olhar a média do passado</strong>
      {v.oos_samples ? "" : " (ainda não há história suficiente para testar"}
      {v.oos_samples ? "." : ")."} A chance mostrada é quantas vezes {classLabel} renderam mais que o{" "}
      {data.benchmark} em períodos de {plural(data.years)} ({formatProbability(data.beat_benchmark.base_rate)}), e a ordem
      segue quem rendeu mais nos últimos 10 anos sem sustos grandes demais.
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
      <Breadcrumbs items={[{ label: "Longo prazo" }]} />
      <PageTitle
        title="Melhores para o longo prazo"
        subtitle="Chance de cada investimento render mais que a média da bolsa e que a renda fixa (CDI) em 1, 3, 5 e 10 anos, olhando o que aconteceu desde 2000, inclusive nas crises."
      />
      <InfoBanner>
        {data?.disclaimer ??
          "As chances vêm de estatística sobre o passado. O que rendeu antes não garante o futuro. Não é recomendação de investimento."}
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
        <EmptyState>Os dados de longo prazo ainda estão sendo preparados. Tente de novo em alguns minutos.</EmptyState>
      ) : (
        <>
          <AiInsight
            context={`horizontes:${assetClass}:${years}`}
            title={`O prazo de ${plural(years)} explicado pela IA`}
            askPrompt={`Explique de forma simples a lista de ${plural(years)} de ${assetClass === "fiis" ? "FIIs" : "ações"}`}
          />
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <ScenarioCard scenario={data.scenario} />
            <Card>
              <h2 className="mb-3 text-lg">Como ler</h2>
              <div className="flex flex-col gap-3 text-sm text-muted">
                <ModelNote data={data} />
                <p>
                  &quot;Quanto costuma render&quot; é o rendimento por ano mais comum em todos os períodos de{" "}
                  {plural(data.years)} desde que ele existe, com a faixa entre os casos ruins e os bons.
                  Dados até {data.data_through}.
                  {data.benchmark_is_proxy && ` Sem o índice oficial na fonte, a referência é a ${data.benchmark}.`}
                </p>
                <p>
                  A lista só tem empresas e fundos grandes de hoje. Os que encolheram ou sumiram ficam de
                  fora, então os números do passado tendem a parecer melhores do que foram.
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
                    Chance de bater a <span className="md:hidden">bolsa</span>
                    <span className="hidden md:inline">{data.benchmark}</span>
                  </span>
                  <span className="tabular block font-bold text-accent-text">{formatProbability(a.prob_beat_benchmark)}</span>
                </span>
                <span className="hidden md:block">
                  <span className="block text-xs text-muted">Chance de bater o CDI</span>
                  <span className="tabular block font-semibold">{formatProbability(a.prob_beat_cdi)}</span>
                </span>
                <span className="hidden md:block">
                  <span className="block text-xs text-muted">Quanto costuma render por ano</span>
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
                  <span className="block text-xs text-muted">Retorno por risco (10 anos)</span>
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
