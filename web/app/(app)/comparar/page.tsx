import Link from "next/link";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Term } from "@/app/components/Term";
import { Breadcrumbs, Card, CardHeader, EmptyState, InfoBanner, PageTitle } from "@/app/components/ui";
import { getAssetHistory, getHorizon, type AssetHistory, type RiskMetrics } from "@/lib/api";
import { changeColor, formatBRL, formatMonth, formatProbability, formatRatio } from "@/lib/format";
import type { GlossaryKey } from "@/lib/glossary";
import { Picker } from "./Picker";

export const dynamic = "force-dynamic";

const HORIZON_YEARS = ["1", "3", "5", "10"];
// Constantes de um módulo "use client" chegam aqui como referência, não como valor: o limite fica repetido.
const MAX_ASSETS = 4;

type Metric = {
  label: string;
  term?: GlossaryKey;
  hint: string;
  get: (r: RiskMetrics) => number | null | undefined;
  format: (v: number) => string;
  // Qual valor é o melhor da linha: o maior ou o menor.
  better: "high" | "low";
};

const METRICS: Metric[] = [
  { label: "Retorno ao ano", term: "retorno_ano", hint: "média anual dos últimos 10 anos, com proventos", get: (r) => r.cagr, format: (v) => formatRatio(v), better: "high" },
  { label: "R$ 1.000 viraram", hint: "no período, com proventos reinvestidos", get: (r) => 1000 * (1 + r.total_return), format: (v) => formatBRL(Math.round(v)).replace(/,00$/, ""), better: "high" },
  { label: "Volatilidade", term: "volatilidade", hint: "quanto o preço sobe e desce; menor é mais estável", get: (r) => r.volatility, format: (v) => formatRatio(v, false), better: "low" },
  { label: "Pior queda", term: "pior_queda", hint: "do topo ao fundo no período", get: (r) => r.max_drawdown, format: (v) => formatRatio(v), better: "high" },
  { label: "Pior 12 meses", hint: "o pior ano corrido", get: (r) => r.worst_12m, format: (v) => formatRatio(v), better: "high" },
  { label: "Retorno por risco (Sharpe)", term: "sharpe", hint: "quanto rendeu acima do CDI para cada unidade de risco", get: (r) => r.sharpe, format: (v) => v.toLocaleString("pt-BR"), better: "high" },
];

function best(values: (number | null | undefined)[], better: "high" | "low") {
  const valid = values.filter((v): v is number => v != null);
  // Sem destaque quando só um ativo tem o dado ou todos empatam.
  if (valid.length < 2 || valid.every((v) => v === valid[0])) return null;
  return better === "high" ? Math.max(...valid) : Math.min(...valid);
}

/** Frases simples, sem IA, sobre quem se destacou em cada quesito. */
function summary(items: AssetHistory[]) {
  const withRisk = items.filter((h) => h.risk_10y);
  if (withRisk.length < 2) return [];
  const by = (f: (r: RiskMetrics) => number | null | undefined, dir: 1 | -1) =>
    [...withRisk].filter((h) => f(h.risk_10y!) != null).sort((a, b) => dir * (f(b.risk_10y!)! - f(a.risk_10y!)!))[0];
  const ret = by((r) => r.cagr, 1);
  const calm = by((r) => r.volatility, -1);
  const sharpe = by((r) => r.sharpe, 1);
  const lines = [
    `${ret.ticker} foi o que mais rendeu: ${formatRatio(ret.risk_10y!.cagr)} ao ano.`,
    `${calm.ticker} foi o mais estável, com volatilidade de ${formatRatio(calm.risk_10y!.volatility, false)}.`,
  ];
  if (sharpe) lines.push(`${sharpe.ticker} teve o melhor retorno pelo risco corrido (Sharpe ${sharpe.risk_10y!.sharpe?.toLocaleString("pt-BR")}).`);
  return lines;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ativos?: string }> }) {
  const { ativos } = await searchParams;
  const selected = [...new Set((ativos ?? "").toUpperCase().split(",").map((t) => t.trim()).filter(Boolean))].slice(0, MAX_ASSETS);
  const [acoes, fiis, ...histories] = await Promise.all([
    getHorizon("acoes", 10),
    getHorizon("fiis", 10),
    ...selected.map((t) => getAssetHistory(t)),
  ]);
  const options = [...(acoes?.assets ?? []), ...(fiis?.assets ?? [])].map((a) => ({ ticker: a.ticker, name: a.name }));
  const items = histories.filter((h): h is AssetHistory => !!h);
  const missing = selected.filter((t, i) => !histories[i]);

  return (
    <>
      <Breadcrumbs items={[{ label: "Comparar ativos" }]} />
      <PageTitle
        title="Comparar ativos"
        subtitle="Coloque até 4 ações ou FIIs lado a lado: retorno, risco, comportamento nas crises e chances por horizonte, com 10 anos de histórico."
      />
      <Picker selected={selected} options={options} />
      {missing.length > 0 && (
        <p className="mb-4 text-sm text-muted">Sem histórico de longo prazo no app: {missing.join(", ")}.</p>
      )}

      {items.length < 2 ? (
        <EmptyState>Escolha pelo menos dois ativos para comparar.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="mb-5 grid gap-4" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
              {items.map((h) => (
                <Link key={h.ticker} href={`/ativo/${h.ticker}`} className="flex min-w-0 items-center gap-3">
                  <AssetLogo ticker={h.ticker} src={h.logo_url} size={40} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{h.ticker}</span>
                    <span className="block truncate text-xs text-muted">{h.name}</span>
                  </span>
                </Link>
              ))}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {summary(items).map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          </Card>

          <CompareTable
            title="Risco e retorno"
            subtitle={`Últimos 10 anos (ou desde o início do ativo), até ${formatMonth(items[0].data_through)}. Em amarelo, o melhor de cada linha.`}
            items={items}
            rows={METRICS.map((m) => {
              const values = items.map((h) => (h.risk_10y ? m.get(h.risk_10y) : null));
              const top = best(values, m.better);
              return {
                label: m.label,
                term: m.term,
                hint: m.hint,
                cells: values.map((v) => ({ text: v == null ? "–" : m.format(v), highlight: v != null && v === top })),
              };
            })}
          />

          <CompareTable
            title="Chance de superar o índice"
            subtitle="Probabilidade estimada de cada ativo superar o Ibovespa (ações) ou o IFIX (FIIs) em cada prazo."
            items={items}
            rows={HORIZON_YEARS.map((y) => {
              const values = items.map((h) => h.horizons[y]?.prob_beat_benchmark ?? null);
              const top = best(values, "high");
              return {
                label: y === "1" ? "Em 1 ano" : `Em ${y} anos`,
                cells: values.map((v) => ({ text: formatProbability(v), highlight: v != null && v === top })),
              };
            })}
          />

          <CompareTable
            title="Nas crises"
            subtitle="Queda do pico ao fundo em cada crise. Traço quando o ativo ainda não negociava."
            items={items}
            rows={items[0].crisis_list.map((c) => {
              const values = items.map((h) => h.crises.find((x) => x.key === c.key)?.return ?? null);
              const top = best(values, "high");
              return {
                label: c.label,
                hint: `${formatMonth(c.start)} a ${formatMonth(c.end)}`,
                cells: values.map((v) => ({ text: formatRatio(v), highlight: v != null && v === top, color: v == null ? "" : changeColor(v) })),
              };
            })}
          />

          <CompareTable
            title="Ano a ano"
            subtitle="Retorno em cada ano-calendário, com proventos."
            items={items}
            rows={[...new Set(items.flatMap((h) => h.annual.map((a) => a.year)))]
              .sort((a, b) => b - a)
              .slice(0, 8)
              .map((year) => {
                const values = items.map((h) => h.annual.find((a) => a.year === year)?.return ?? null);
                const top = best(values, "high");
                const partial = items.some((h) => h.annual.find((a) => a.year === year)?.partial);
                return {
                  label: partial ? `${year} (até agora)` : String(year),
                  cells: values.map((v) => ({ text: formatRatio(v), highlight: v != null && v === top, color: v == null ? "" : changeColor(v) })),
                };
              })}
          />

          <InfoBanner>{items[0].disclaimer}</InfoBanner>
        </div>
      )}
    </>
  );
}

type Row = { label: string; term?: GlossaryKey; hint?: string; cells: { text: string; highlight: boolean; color?: string }[] };

function CompareTable({ title, subtitle, items, rows }: { title: string; subtitle: string; items: AssetHistory[]; rows: Row[] }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="sticky left-0 bg-surface pb-2 pr-3 font-medium" />
              {items.map((h) => (
                <th key={h.ticker} className="pb-2 pr-3 text-right font-semibold text-text">
                  {h.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="sticky left-0 max-w-[160px] bg-surface py-2.5 pr-3 md:max-w-none">
                  <span className="font-medium">{r.term ? <Term k={r.term}>{r.label}</Term> : r.label}</span>
                  {r.hint && <span className="block text-xs text-muted">{r.hint}</span>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={items[i].ticker} className={`tabular py-2.5 pr-3 text-right ${c.color ?? ""}`}>
                    <span className={c.highlight ? "rounded-md bg-accent-bg px-1.5 py-0.5 font-bold text-accent-text" : ""}>{c.text}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
