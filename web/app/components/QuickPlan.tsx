"use client";

import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  getShortTerm,
  type AdvisorAnswers,
  type AdvisorFocus,
  type AdvisorInput,
  type AdvisorPlan,
  type ShortTermAsset,
} from "@/lib/api";
import { formatBRL, formatNumber, formatRatio } from "@/lib/format";
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

// Onde a pessoa quer investir. "Dividir" segue o perfil; as outras concentram tudo em um tipo.
const FOCUS_OPTIONS: { key: AdvisorFocus; label: string; hint: string }[] = [
  { key: "dividir", label: "Dividir (recomendado)", hint: "Um pouco em cada tipo, pelo seu perfil" },
  { key: "renda_fixa", label: "Só renda fixa", hint: "Tesouro, CDB, LCI: não oscila" },
  { key: "renda_variavel", label: "Só renda variável", hint: "Ações, fundos imobiliários e dólar" },
  { key: "acoes", label: "Só ações", hint: "Pedaços de empresas da bolsa" },
  { key: "fiis", label: "Só FIIs", hint: "Fundos imobiliários, com renda todo mês" },
];
const FOCUS_KEY = "aivesting.onde_investir";

function savedFocus(): AdvisorFocus {
  try {
    const v = localStorage.getItem(FOCUS_KEY) as AdvisorFocus | null;
    return v && FOCUS_OPTIONS.some((o) => o.key === v) ? v : "dividir";
  } catch {
    return "dividir";
  }
}

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
  const [focus, setFocus] = useState<AdvisorFocus>("dividir");
  const [extra, setExtra] = useState<ShortTermAsset[]>([]);

  useEffect(() => setFocus(savedFocus()), []);

  const chooseFocus = (f: AdvisorFocus) => {
    setFocus(f);
    try {
      localStorage.setItem(FOCUS_KEY, f);
    } catch {}
  };

  // Concentrando em ações ou FIIs, mostra também os que estão baratos e ganhando força agora (Fundamentus).
  useEffect(() => {
    setExtra([]);
    if (focus !== "acoes" && focus !== "fiis") return;
    let alive = true;
    getShortTerm(focus, "oportunidades")
      .then((r) => alive && setExtra(r?.assets.slice(0, 6) ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [focus]);

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
          focus,
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
  }, [amount, months, focus]);

  if (!(amount > 0)) return null;

  const chooser = (
    <div className="mb-4">
      <div className="mb-2 text-sm font-semibold">Onde você quer investir?</div>
      <div className="flex flex-wrap gap-2">
        {FOCUS_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            title={o.hint}
            onClick={() => chooseFocus(o.key)}
            className={`rounded-full border px-4 py-2 text-sm ${
              o.key === focus ? "border-primary bg-primary font-semibold text-on-primary" : "border-border text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">{FOCUS_OPTIONS.find((o) => o.key === focus)?.hint}.</p>
    </div>
  );

  if (error && !plan)
    return (
      <Card>
        {chooser}
        <p className="text-sm text-muted">Não deu para montar a sugestão agora. O app pode estar acordando; tente de novo em 1 minuto.</p>
      </Card>
    );
  if (!plan || (plan.focus ?? "dividir") !== focus)
    return (
      <Card>
        {chooser}
        <div className="h-40 animate-pulse rounded-card bg-surface-2" />
      </Card>
    );

  const focused = focus !== "dividir";
  const shown = new Set(plan.allocation.flatMap((a) => a.suggested.map((x) => x.ticker)));
  const moreOptions = extra.filter((x) => !shown.has(x.ticker)).slice(0, 5);

  return (
    <Card className="border-primary/60">
      {chooser}
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-text">
        <Sparkles size={14} /> Onde colocar hoje
      </div>
      <h2 className="text-xl font-bold">
        {formatBRL(amount)} por {term(months)}: {focused ? `${(plan.focus_label ?? "").toLowerCase()}, as opções de agora` : "a divisão sugerida agora"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {focused
          ? "Você escolheu concentrar. O app mostra as melhores opções desse tipo para o seu prazo"
          : usingProfile
            ? `Pelo seu perfil ${plan.profile}`
            : "Para um perfil equilibrado (responda 4 perguntas para ajustar ao seu)"}
        , olhando os juros de hoje (Selic {formatNumber(plan.macro.selic ?? 0)}%).
      </p>

      {plan.focus_warning && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-accent-bg px-4 py-3 text-sm text-accent-text">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{plan.focus_warning}</span>
        </div>
      )}

      {plan.allocation.length > 1 && (
        <div className="my-5 flex h-4 overflow-hidden rounded-full">
          {plan.allocation.map((a) => (
            <div key={a.key} style={{ width: `${a.pct}%`, background: COLORS[a.key] }} title={`${a.label}: ${a.pct}%`} />
          ))}
        </div>
      )}

      <ul className={`flex flex-col divide-y divide-border ${plan.allocation.length > 1 ? "" : "mt-4"}`}>
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
                    {a.suggested.slice(0, focused ? 8 : 5).map((x) => (
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
                {focused && a.suggested_rest != null && a.suggested_rest > 1 && (
                  <div className="mt-2 text-xs text-muted">
                    O resto ({formatBRL(a.suggested_rest)}) pode ir para {a.products[0]}, que já junta muitos de uma vez.
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

      {moreOptions.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="text-sm font-semibold">Outras opções baratas e ganhando força agora</div>
          <p className="mb-2 text-xs text-muted">
            Pelos números das empresas (Fundamentus) e pelo preço recente. Toque em um nome para ver o que bancos e corretoras dizem dele.
          </p>
          <div className="flex flex-wrap gap-2">
            {moreOptions.map((x) => (
              <Link
                key={x.ticker}
                href={`/ativo/${x.ticker}`}
                title={x.name}
                className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-3 text-xs font-semibold hover:border-primary"
              >
                <AssetLogo ticker={x.ticker} src={x.logo_url} size={20} />
                {x.ticker}
                {x.dy != null && <span className="font-normal text-muted">paga {formatRatio(x.dy, false)} ao ano</span>}
              </Link>
            ))}
          </div>
          <Link href={`/curto-prazo?classe=${focus}`} className="mt-2 inline-block text-xs font-semibold text-accent-text hover:underline">
            Ver a lista completa
          </Link>
        </div>
      )}

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
