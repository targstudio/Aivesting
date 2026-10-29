"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type AdvisorAnswers, type AdvisorInput, type AdvisorPlan } from "@/lib/api";
import { formatBRL, formatNumber } from "@/lib/format";
import { AssetLogo } from "./AssetLogo";
import { Card } from "./ui";

// Quem ainda não respondeu o perfil recebe o plano de um perfil equilibrado; o prazo vem do que a pessoa digitou.
const DEFAULT_ANSWERS: AdvisorAnswers = { objetivo: 1, prazo: 1, reacao_queda: 1, experiencia: 0, oscilacao: 1 };

const COLORS: Record<string, string> = {
  reserva: "rgb(var(--chart-4))",
  rf_pos: "rgb(var(--chart-2))",
  rf_ipca: "rgb(var(--chart-3))",
  fiis: "rgb(var(--chart-5))",
  internacional: "rgb(0 128 160)",
  acoes: "rgb(var(--chart-1))",
};

function savedProfile(): AdvisorInput | null {
  try {
    const raw = localStorage.getItem("aivesting.assessor");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const term = (m: number) => (m < 12 ? `${m} meses` : m % 12 === 0 ? `${m / 12} ${m === 12 ? "ano" : "anos"}` : `${m} meses`);

/**
 * Plano já pronto para um valor e um prazo: quanto colocar em cada tipo de investimento hoje e em quais ações e fundos.
 * Usa o perfil salvo em Onde investir, ou um perfil equilibrado quando a pessoa ainda não respondeu.
 */
export function QuickPlan({ amount, months, best }: { amount: number; months: number; best?: Partial<Record<string, string>> }) {
  const [plan, setPlan] = useState<AdvisorPlan | null>(null);
  const [error, setError] = useState(false);
  const [usingProfile, setUsingProfile] = useState(false);

  useEffect(() => {
    if (!(amount > 0) || !(months > 0)) return;
    const saved = savedProfile();
    setUsingProfile(!!saved?.answers);
    let alive = true;
    const t = setTimeout(() => {
      apiFetch<AdvisorPlan>("/assessor/plano", {
        method: "POST",
        body: JSON.stringify({
          answers: saved?.answers ?? DEFAULT_ANSWERS,
          amount,
          months,
          has_reserve: saved?.has_reserve ?? false,
          monthly_expenses: saved?.monthly_expenses ?? 0,
        }),
      })
        .then((p) => {
          if (!alive) return;
          setPlan(p);
          setError(false);
        })
        .catch(() => alive && setError(true));
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [amount, months]);

  if (!(amount > 0)) return null;
  if (error && !plan)
    return <Card className="text-sm text-muted">Não deu para montar a sugestão agora. O app pode estar acordando; tente de novo em 1 minuto.</Card>;
  if (!plan) return <div className="h-48 animate-pulse rounded-card bg-surface-2" />;

  return (
    <Card className="border-primary/60">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-text">
        <Sparkles size={14} /> Onde colocar hoje
      </div>
      <h2 className="text-xl font-bold">
        {formatBRL(amount)} por {term(months)}: a divisão sugerida agora
      </h2>
      <p className="mt-1 text-sm text-muted">
        {usingProfile ? `Pelo seu perfil ${plan.profile}` : "Para um perfil equilibrado (responda 4 perguntas para ajustar ao seu)"}, olhando
        o seu prazo e os juros de hoje (Selic {formatNumber(plan.macro.selic ?? 0)}%).
      </p>

      <div className="my-5 flex h-4 overflow-hidden rounded-full">
        {plan.allocation.map((a) => (
          <div key={a.key} style={{ width: `${a.pct}%`, background: COLORS[a.key] }} title={`${a.label}: ${a.pct}%`} />
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {plan.allocation.map((a) => (
          <li key={a.key} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[a.key] }} />
              <div className="min-w-0">
                <div className="font-semibold">{a.label}</div>
                <div className="text-sm text-muted">
                  {best?.[a.key] ? `Melhor opção para o seu prazo agora: ${best[a.key]}.` : a.products.slice(0, 2).join(" ou ")}
                </div>
                {a.suggested.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.suggested.slice(0, 5).map((x) => (
                      <Link
                        key={x.ticker}
                        href={`/ativo/${x.ticker}`}
                        className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-3 text-xs font-semibold hover:border-primary"
                      >
                        <AssetLogo ticker={x.ticker} src={x.logo_url} size={20} />
                        {x.ticker}
                        {x.value != null && <span className="font-normal text-muted">{formatBRL(x.value)}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right md:w-36">
              <div className="tabular font-bold">{formatBRL(a.value)}</div>
              <div className="text-xs text-muted">{formatNumber(a.pct)}%</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-xl text-xs text-muted">{plan.disclaimer}</p>
        <Link
          href="/assessor"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
        >
          {usingProfile ? "Ver o plano completo" : "Ajustar ao meu perfil"} <ArrowRight size={16} />
        </Link>
      </div>
    </Card>
  );
}
