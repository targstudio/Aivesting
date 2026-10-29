"use client";

import { Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { MoneyField, parseMoney } from "@/app/components/fields";
import { Term } from "@/app/components/Term";
import { Card, CardHeader, InfoBanner } from "@/app/components/ui";
import type { FixedIncomeRates, TesouroBond } from "@/lib/api";
import { formatBRL, formatNumber } from "@/lib/format";
import { incomeTaxRate, savingsAnnual, simulateFixed, type FixedOption } from "@/lib/fixedIncome";

const MONTH_PRESETS = [6, 12, 24, 36, 60, 120];

const monthsLabel = (m: number) => (m % 12 === 0 ? (m === 12 ? "1 ano" : `${m / 12} anos`) : `${m} meses`);
const pctText = (v: number) => `${formatNumber(Math.round(v * 100) / 100)}%`;
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

function monthsUntil(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const now = new Date();
  return (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
}

/** Título do tipo pedido com vencimento mais próximo do prazo, preferindo os que vencem depois dele. */
function pickBond(bonds: TesouroBond[], kind: TesouroBond["kind"], months: number) {
  const list = bonds.filter((b) => b.kind === kind && !b.title.includes("Juros Semestrais") && !b.title.includes("Renda+") && !b.title.includes("Educa+"));
  if (!list.length) return null;
  const after = list.filter((b) => monthsUntil(b.maturity) >= months);
  const pool = after.length ? after : list;
  return pool.sort((a, b) => Math.abs(monthsUntil(a.maturity) - months) - Math.abs(monthsUntil(b.maturity) - months))[0];
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">
      {label}
      <span className="flex min-w-0 items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-primary">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ""))}
          className="w-full min-w-0 bg-transparent font-normal outline-none"
        />
        <span className="shrink-0 text-muted">{suffix}</span>
      </span>
    </label>
  );
}

const num = (v: string) => Number(v.replace(",", ".")) || 0;

export function FixedIncome({ rates }: { rates: FixedIncomeRates | null }) {
  const [amount, setAmount] = useState("10.000");
  const [months, setMonths] = useState(24);
  const [cdbPct, setCdbPct] = useState("100");
  const [lciPct, setLciPct] = useState("90");
  const [cdi, setCdi] = useState(formatNumber(rates?.cdi ?? 14.9));
  const [ipca, setIpca] = useState(formatNumber(rates?.ipca_12m ?? 4.5));
  const bonds = rates?.tesouro ?? [];

  const results = useMemo(() => {
    const value = parseMoney(amount);
    if (!value || !months) return [];
    const c = num(cdi);
    const inflation = num(ipca);
    const selic = c + 0.1;
    const options: FixedOption[] = [
      { key: "poupanca", label: "Poupança", detail: "sem imposto de renda", annualGross: savingsAnnual(selic), taxFree: true, custody: 0 },
      { key: "cdb", label: `CDB ${cdbPct}% do CDI`, detail: "tem garantia do FGC até R$ 250 mil por banco", annualGross: (c * num(cdbPct)) / 100, taxFree: false, custody: 0 },
      { key: "lci", label: `LCI/LCA ${lciPct}% do CDI`, detail: "sem imposto de renda e com garantia do FGC; o dinheiro costuma ficar preso por 90 dias ou mais", annualGross: (c * num(lciPct)) / 100, taxFree: true, custody: 0 },
    ];
    const tSelic = pickBond(bonds, "selic", months);
    options.push({
      key: "selic",
      label: "Tesouro Selic",
      detail: tSelic ? `vence em ${fmtDate(tSelic.maturity)}; dá para resgatar a qualquer dia sem perder dinheiro` : "dá para resgatar a qualquer dia sem perder dinheiro",
      annualGross: (1 + selic / 100) * (1 + (tSelic?.rate ?? 0.05) / 100) * 100 - 100,
      taxFree: false,
      custody: 0.2,
      custodyFreeUpTo: 10000,
    });
    const pre = pickBond(bonds, "prefixado", months);
    if (pre) {
      options.push({
        key: "prefixado",
        label: `Tesouro Prefixado ${new Date(`${pre.maturity}T12:00:00`).getFullYear()}`,
        detail: `${pctText(pre.rate)} ao ano até ${fmtDate(pre.maturity)}`,
        annualGross: pre.rate,
        taxFree: false,
        custody: 0.2,
        note: monthsUntil(pre.maturity) > months + 1 ? "Vence depois do seu prazo: vender antes paga o preço do dia, que pode ser maior ou menor." : undefined,
      });
    }
    const ip = pickBond(bonds, "ipca", months);
    if (ip) {
      options.push({
        key: "ipca",
        label: `Tesouro IPCA+ ${new Date(`${ip.maturity}T12:00:00`).getFullYear()}`,
        detail: `IPCA + ${pctText(ip.rate)} ao ano até ${fmtDate(ip.maturity)}`,
        annualGross: ((1 + inflation / 100) * (1 + ip.rate / 100) - 1) * 100,
        taxFree: false,
        custody: 0.2,
        note: monthsUntil(ip.maturity) > months + 1 ? "Vence depois do seu prazo: vender antes paga o preço do dia, que pode ser maior ou menor." : undefined,
      });
    }
    return options.map((o) => simulateFixed(o, value, months, inflation)).sort((a, b) => b.net - a.net);
  }, [amount, months, cdbPct, lciPct, cdi, ipca, bonds]);

  const value = parseMoney(amount);
  const ir = incomeTaxRate(Math.round(months * 30.4));
  // CDB equivalente a uma LCI: o quanto do CDI um CDB precisa pagar para empatar depois do IR.
  const lciEquivalent = num(lciPct) / (1 - ir);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <div className="flex flex-col gap-5">
          <MoneyField label="Quanto quer aplicar" value={amount} onChange={setAmount} />
          <div className="flex flex-col gap-2 text-sm font-semibold">
            Por quanto tempo
            <div className="flex flex-wrap gap-2">
              {MONTH_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    m === months ? "border-primary bg-primary text-on-primary" : "border-border text-muted hover:text-text"
                  }`}
                >
                  {monthsLabel(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="CDB paga" value={cdbPct} onChange={setCdbPct} suffix="% CDI" />
            <NumberField label="LCI/LCA paga" value={lciPct} onChange={setLciPct} suffix="% CDI" />
            <NumberField label="CDI esperado" value={cdi} onChange={setCdi} suffix="% ao ano" />
            <NumberField label="Inflação esperada" value={ipca} onChange={setIpca} suffix="% ao ano" />
          </div>
          <p className="text-xs text-muted">
            CDI e inflação começam com os números de hoje (Selic {rates?.selic != null ? pctText(rates.selic) : "–"}, IPCA 12 meses{" "}
            {rates?.ipca_12m != null ? pctText(rates.ipca_12m) : "–"}) e ficam fixos no prazo todo. Mude para testar outros cenários.
          </p>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title={`${formatBRL(value)} por ${monthsLabel(months)}`}
            subtitle={`Quanto sobra no seu bolso, já tirando o imposto de renda (${pctText(ir * 100)} nesse prazo) e a taxa do Tesouro. Do que rende mais para o que rende menos.`}
          />
          <ul className="flex flex-col divide-y divide-border">
            {results.map((r, i) => (
              <li key={r.key} className="grid gap-2 py-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    {i === 0 && <Trophy size={16} className="text-accent-text" />}
                    {r.label}
                  </div>
                  <div className="text-xs text-muted">{r.detail}</div>
                  {r.note && <div className="mt-1 text-xs text-accent-text">{r.note}</div>}
                </div>
                <div className="tabular text-sm md:text-right">
                  <div className="text-lg font-bold">{formatBRL(r.net)}</div>
                  <div className="text-xs text-muted">
                    +{formatBRL(r.netGain)} · {pctText(r.netAnnual)} ao ano no bolso
                    {r.tax > 0 && ` · IR ${formatBRL(r.tax)}`}
                    {r.custodyCost >= 0.5 && ` · custódia ${formatBRL(r.custodyCost)}`}
                  </div>
                  <div className="text-xs text-muted">{formatBRL(r.real)} em dinheiro de hoje</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Dica rápida: LCI x CDB" />
          <p className="text-sm text-muted">
            Nesse prazo (<Term k="ir_regressivo">IR</Term> de {pctText(ir * 100)}), uma LCI/LCA de {lciPct}% do CDI rende o mesmo que um CDB de{" "}
            <strong className="text-text">{formatNumber(Math.round(lciEquivalent))}% do CDI</strong>, porque a LCI não paga IR.
            Quanto mais curto o prazo, maior o IR e mais vantagem para as isentas. CDB e LCI têm a garantia do{" "}
            <Term k="fgc">FGC</Term>; prefixados e IPCA+ sofrem <Term k="marcacao">marcação a mercado</Term>.
          </p>
        </Card>

        {bonds.length > 0 && (
          <Card>
            <CardHeader
              title="Taxas do Tesouro Direto"
              subtitle={`Quanto cada título paga${rates?.tesouro_date ? ` em ${fmtDate(rates.tesouro_date)}` : ""}, segundo o Tesouro Transparente`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Título</th>
                    <th className="pb-2 font-medium">Vencimento</th>
                    <th className="pb-2 text-right font-medium">Paga por ano</th>
                  </tr>
                </thead>
                <tbody>
                  {bonds.map((b) => (
                    <tr key={b.title + b.maturity} className="border-t border-border">
                      <td className="py-2">{b.title}</td>
                      <td className="py-2">{fmtDate(b.maturity)}</td>
                      <td className="tabular py-2 text-right">
                        {b.kind === "selic" ? `Selic + ${pctText(b.rate)}` : b.kind === "ipca" ? `IPCA + ${pctText(b.rate)}` : pctText(b.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <InfoBanner>
          Simulação com as taxas de hoje fixas no prazo todo, sem o imposto de resgates antes de 30 dias (IOF). Títulos e CDBs
          com prazo maior que o seu podem valer mais ou menos se vendidos antes. Não é recomendação de investimento.
        </InfoBanner>
      </div>
    </div>
  );
}
