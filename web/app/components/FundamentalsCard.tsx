import type { Fundamentals } from "@/lib/api";
import { formatNumber, formatRatio } from "@/lib/format";
import type { GlossaryKey } from "@/lib/glossary";
import { Term } from "./Term";
import { Card, CardHeader } from "./ui";

function bigMoney(v: number) {
  if (v >= 1e9) return `R$ ${formatNumber(Math.round(v / 1e8) / 10)} bi`;
  if (v >= 1e6) return `R$ ${formatNumber(Math.round(v / 1e5) / 10)} mi`;
  return `R$ ${formatNumber(Math.round(v))}`;
}

/** Indicadores de balanço com uma frase neutra de contexto; cada nome abre a explicação. */
export function FundamentalsCard({ f, isFii }: { f: Fundamentals; isFii: boolean }) {
  const items: { term?: GlossaryKey; label: string; value: string; hint?: string }[] = [];
  const x = (v: number) => `${formatNumber(v)}x`;
  if (f.price_earnings != null && !isFii)
    items.push({
      term: "pl",
      label: "P/L",
      value: f.price_earnings > 0 ? x(f.price_earnings) : "prejuízo",
      hint: f.price_earnings > 0 ? `o preço equivale a ${formatNumber(Math.round(f.price_earnings))} anos do lucro atual` : "a empresa teve prejuízo no último ano",
    });
  if (f.price_to_book != null)
    items.push({
      term: "pvp",
      label: "P/VP",
      value: x(f.price_to_book),
      hint: f.price_to_book < 1 ? "custa menos do que vale no balanço" : f.price_to_book < 1.1 ? "custa perto do que vale no balanço" : "custa mais do que vale no balanço",
    });
  if (f.roe != null) items.push({ term: "roe", label: "Lucro sobre o patrimônio (ROE)", value: formatRatio(f.roe, false) });
  if (f.net_margin != null) items.push({ term: "margem_liquida", label: "Margem líquida", value: formatRatio(f.net_margin, false) });
  if (f.debt_to_equity != null) items.push({ term: "divida_patrimonio", label: "Dívida sobre patrimônio", value: `${formatNumber(Math.round(f.debt_to_equity))}%` });
  if (f.revenue_growth != null) items.push({ label: "Crescimento da receita", value: formatRatio(f.revenue_growth), hint: "no último ano" });
  if (f.market_cap != null) items.push({ label: "Valor de mercado", value: bigMoney(f.market_cap) });
  if (!items.length) return null;

  return (
    <Card className="mb-6">
      <CardHeader title="Saúde da empresa" subtitle="Números do último balanço. Toque no nome para entender cada um." />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.label}>
            <div className="tabular text-xl font-bold">{i.value}</div>
            <div className="mt-1 text-sm text-muted">{i.term ? <Term k={i.term}>{i.label}</Term> : i.label}</div>
            {i.hint && <div className="mt-0.5 text-xs text-muted">{i.hint}</div>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        {isFii && "Vacância e dados de imóveis dos FIIs ainda não vêm dessa fonte. "}
        {f.disclaimer}
      </p>
    </Card>
  );
}
