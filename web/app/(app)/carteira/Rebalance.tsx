"use client";

import { PiggyBank } from "lucide-react";
import { useState } from "react";
import { MoneyField, parseMoney } from "@/app/components/fields";
import { Card, CardHeader } from "@/app/components/ui";
import type { PortfolioAnalysis } from "@/lib/api";
import { formatBRL, formatNumber } from "@/lib/format";

type Comparison = NonNullable<PortfolioAnalysis["plan"]>["comparison"];

/**
 * Divide um aporte novo entre as classes sem vender nada: primeiro cobre o que falta em cada classe para o
 * plano (com o total já somado ao aporte), proporcionalmente quando o aporte não dá para tudo; o que sobrar
 * segue os pesos do plano.
 */
export function splitContribution(comparison: Comparison, total: number, amount: number) {
  const after = total + amount;
  const gaps = comparison.map((c) => Math.max(0, c.target_pct * after - c.current_pct * total));
  const gapSum = gaps.reduce((a, b) => a + b, 0);
  const targetSum = comparison.reduce((a, c) => a + c.target_pct, 0) || 1;
  return comparison.map((c, i) => {
    const value =
      gapSum >= amount
        ? (gaps[i] / (gapSum || 1)) * amount
        : gaps[i] + ((amount - gapSum) * c.target_pct) / targetSum;
    return { ...c, value, after_pct: (c.current_pct * total + value) / after };
  });
}

/** Quanto teria de aportar para todas as classes com alvo chegarem ao plano sem vender nada. */
export function amountToBalance(comparison: Comparison, total: number) {
  const needed = Math.max(total, ...comparison.filter((c) => c.target_pct > 0).map((c) => (c.current_pct * total) / c.target_pct));
  return needed - total;
}

export function RebalanceCard({ plan, total }: { plan: NonNullable<PortfolioAnalysis["plan"]>; total: number }) {
  const [amount, setAmount] = useState("");
  const value = parseMoney(amount);
  const split = value > 0 ? splitContribution(plan.comparison, total, value).filter((s) => s.value >= 0.5) : [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const toBalance = amountToBalance(plan.comparison, total);

  return (
    <Card>
      <CardHeader
        title="Onde colocar o próximo aporte"
        subtitle="Aproxima a carteira do plano do assessor sem precisar vender nada"
      />
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3">
          <MoneyField label="Quanto vai aportar agora" value={amount} onChange={setAmount} />
          <p className="text-xs text-muted">
            O valor vai primeiro para as classes que estão abaixo do plano. Se sobrar, segue as proporções do plano.
          </p>
          {toBalance >= 1 && (
            <button
              type="button"
              onClick={() => setAmount(formatNumber(Math.ceil(toBalance)))}
              className="w-fit text-left text-xs font-semibold text-accent-text hover:underline"
            >
              Para chegar ao plano só com aportes: {formatBRL(Math.ceil(toBalance))}
            </button>
          )}
        </div>
        {split.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {split
              .sort((a, b) => b.value - a.value)
              .map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="block font-semibold">{s.label}</span>
                    <span className="tabular text-xs text-muted">
                      {pct(s.current_pct)} → {pct(s.after_pct)} da carteira · plano {pct(s.target_pct)}
                    </span>
                  </span>
                  <span className="tabular font-bold">{formatBRL(s.value)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            <PiggyBank size={20} className="shrink-0" /> Digite o valor do aporte para ver a divisão entre as classes.
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        Divisão por classe a partir do seu perfil no assessor. Não considera impostos, custos nem a escolha de cada ativo.
      </p>
    </Card>
  );
}
