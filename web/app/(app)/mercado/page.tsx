import Link from "next/link";
import { AiInsight } from "@/app/components/AiInsight";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Sparkline } from "@/app/components/Sparkline";
import { Breadcrumbs, Card, EmptyState, InfoBanner, PageTitle } from "@/app/components/ui";
import { getMacro, getMarket, type MarketItem, type Mover } from "@/lib/api";
import { changeColor, formatBRL, formatNumber, formatPercent, formatUpdated } from "@/lib/format";

export const dynamic = "force-dynamic";

const GROUP_ORDER = ["Brasil", "Moedas", "EUA", "Europa", "China", "Commodities", "Cripto"];

function formatValue(i: MarketItem) {
  if (i.unit === "R$") return formatBRL(i.value);
  if (i.unit === "US$") return `US$ ${formatNumber(i.value >= 1000 ? Math.round(i.value) : i.value)}`;
  if (i.unit === "%") return `${formatNumber(i.value)}%`;
  return formatNumber(Math.round(i.value));
}

function IndexCard({ item }: { item: MarketItem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface px-4 py-4 md:px-5">
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{item.group}</div>
        <div className="truncate text-sm">{item.label}</div>
        <div className="tabular whitespace-nowrap text-lg font-bold">{formatValue(item)}</div>
        <div className={`tabular text-sm font-semibold ${changeColor(item.change_percent)}`}>{formatPercent(item.change_percent)}</div>
      </div>
      <span className="hidden shrink-0 sm:block" title="Últimos 30 dias">
        <Sparkline values={item.spark} width={80} />
      </span>
    </div>
  );
}

function MoverList({ title, items, empty }: { title: string; items: Mover[]; empty: string }) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {items.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((a) => (
            <li key={a.ticker}>
              <Link href={`/ativo/${a.ticker}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                <AssetLogo ticker={a.ticker} src={a.logo_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{a.ticker}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.asset_class === "fiis" ? "FII" : "Ação"} · {a.rank}º no ranking
                  </span>
                </span>
                <span className="hidden sm:block">
                  <Sparkline values={a.spark} width={72} height={28} />
                </span>
                <span className="w-24 text-right">
                  <span className="tabular block text-sm">{formatBRL(a.price)}</span>
                  <span className={`tabular block text-sm font-semibold ${changeColor(a.change_percent)}`}>
                    {formatPercent(a.change_percent)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </Card>
  );
}

export default async function MarketPage() {
  const [market, macro] = await Promise.all([getMarket(), getMacro()]);
  const indices = [...(market?.indices ?? [])].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const breadth = market?.amplitude;
  const total = breadth ? breadth.altas + breadth.baixas + breadth.estaveis : 0;

  return (
    <>
      <Breadcrumbs items={[{ label: "Mercado" }]} />
      <PageTitle
        title="Como está o mercado agora"
        subtitle="Bolsa, dólar, juros e matérias-primas no Brasil e no mundo, e o que mais subiu e caiu hoje."
      />
      <InfoBanner>
        {market?.pregao_aberto ? "A bolsa está aberta agora." : "A bolsa está fechada: valores do último dia."} Preços com
        atraso de cerca de 15 minutos. Só para informação, não é recomendação de investimento.
      </InfoBanner>

      <AiInsight context="mercado" title="Resumo do dia pela IA" askPrompt="O que mais explica o movimento do mercado hoje?" />

      {!market ? (
        <EmptyState>Não foi possível carregar os dados do mercado. Tente de novo em alguns minutos.</EmptyState>
      ) : (
        <>
          {breadth && total > 0 && (
            <Card className="mb-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">Como está a bolsa hoje</h2>
                <span className="text-sm text-muted">
                  {breadth.altas} sobem · {breadth.baixas} caem · {breadth.estaveis} estáveis
                  {(market.precos_de ?? market.atualizado_em) &&
                    ` · última atualização: ${formatUpdated((market.precos_de ?? market.atualizado_em)!)}`}
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-track">
                <div className="bg-positive" style={{ width: `${(breadth.altas / total) * 100}%` }} />
                <div className="bg-negative" style={{ width: `${(breadth.baixas / total) * 100}%` }} />
              </div>
            </Card>
          )}

          <h2 className="mb-3 text-lg font-bold">Brasil e mundo</h2>
          {indices.length ? (
            <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {indices.map((i) => (
                <IndexCard key={i.symbol} item={i} />
              ))}
            </div>
          ) : (
            <div className="mb-8">
              <EmptyState>Os dados não chegaram agora. Tente de novo em alguns minutos.</EmptyState>
            </div>
          )}

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <MoverList title="Maiores altas do dia" items={market.altas} empty="Nenhum investimento da lista sobe hoje." />
            <MoverList title="Maiores baixas do dia" items={market.baixas} empty="Nenhum investimento da lista cai hoje." />
          </div>
        </>
      )}

      {macro?.indicators.length ? (
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Macro Brasil</h2>
            <Link href="/macro" className="rounded-full bg-accent-bg px-4 py-1.5 text-sm font-semibold text-accent-text">
              Ver cenário
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {macro.indicators.map((m) => (
              <div key={m.key}>
                <div className="tabular text-lg font-bold">
                  {m.unit === "R$" ? "R$ " : ""}
                  {formatNumber(m.value)}
                  {m.unit.startsWith("%") ? "%" : ""}
                </div>
                <div className="text-muted">{m.label}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
