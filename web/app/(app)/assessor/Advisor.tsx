"use client";

import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/components/AppProvider";
import { AssetLogo } from "@/app/components/AssetLogo";
import { MoneyField, parseMoney } from "@/app/components/fields";
import { Card, InfoBanner } from "@/app/components/ui";
import {
  apiFetch,
  type AdvisorAllocation,
  type AdvisorAnswers,
  type AdvisorInput,
  type AdvisorPlan,
  type AdvisorQuestion,
  type AdvisorTerm,
} from "@/lib/api";
import { formatBRL, formatNumber } from "@/lib/format";
import { loadPortfolio } from "@/lib/portfolio";
import type { PortfolioAnalysis } from "@/lib/api";
import { Chat } from "../assistente/Chat";
import { Markdown } from "@/app/components/Markdown";
import { Donut } from "@/app/components/charts";

const KEY = "aivesting.assessor";

const PROFILE_TEXT = {
  conservador: "Prioriza segurança e poder resgatar rápido. A maior parte fica em renda fixa.",
  moderado: "Equilibra segurança e crescimento, com uma boa parte em ações e fundos.",
  arrojado: "Aceita ver o dinheiro subir e cair bastante em busca de ganhar mais no longo prazo.",
};

// Cores das classes no gráfico de alocação (paleta dos gráficos).
const CLASS_COLOR: Record<string, string> = {
  reserva: "rgb(var(--chart-4))",
  rf_pos: "rgb(var(--chart-2))",
  rf_ipca: "rgb(var(--chart-3))",
  fiis: "rgb(var(--chart-5))",
  internacional: "rgb(0 128 160)",
  acoes: "rgb(var(--chart-1))",
};

function loadSaved(): AdvisorInput | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const MONTH_PRESETS = [6, 12, 24, 36, 60, 120];

/** Mesmo corte da API: menos de 12 meses, 12 a 35, 36 a 59, 60 ou mais. */
function prazoFromMonths(m: number) {
  return m < 12 ? 0 : m < 36 ? 1 : m < 60 ? 2 : 3;
}

function monthsLabel(m: number) {
  if (m % 12 === 0) return m === 12 ? "1 ano" : `${m / 12} anos`;
  return `${m} meses`;
}

export function Advisor() {
  const { prefs, ready } = useApp();
  const [questions, setQuestions] = useState<AdvisorQuestion[] | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Partial<AdvisorAnswers>>({});
  const [amount, setAmount] = useState("");
  const [contribution, setContribution] = useState("");
  const [expenses, setExpenses] = useState("");
  const [hasReserve, setHasReserve] = useState(false);
  const [months, setMonths] = useState("");
  const [input, setInput] = useState<AdvisorInput | null>(null);
  const [plan, setPlan] = useState<AdvisorPlan | null>(null);
  const [explanation, setExplanation] = useState<{ state: "loading" | "done" | "error"; text: string } | null>(null);
  // Carteira importada na tela Minha carteira: o assessor considera o que a pessoa já tem.
  const [portfolio, setPortfolio] = useState<PortfolioAnalysis | null>(null);

  useEffect(() => {
    const stored = loadPortfolio();
    if (!stored?.holdings.length) return;
    apiFetch<PortfolioAnalysis>("/carteira/analise", { method: "POST", body: JSON.stringify({ holdings: stored.holdings }) })
      .then(setPortfolio)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    apiFetch<{ perguntas: AdvisorQuestion[] }>("/assessor/perguntas")
      .then((r) => setQuestions(r.perguntas))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar o questionário."));
    const saved = loadSaved();
    if (saved) setInput(saved);
  }, []);

  const loadPlan = useCallback(
    async (inp: AdvisorInput) => {
      setPlan(null);
      setExplanation({ state: "loading", text: "" });
      try {
        setPlan(await apiFetch<AdvisorPlan>("/assessor/plano", { method: "POST", body: JSON.stringify(inp) }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao montar o plano.");
        setExplanation(null);
        return;
      }
      try {
        const r = await apiFetch<{ explanation: string }>(`/assessor/explicar?nivel=${prefs.level}`, {
          method: "POST",
          body: JSON.stringify(inp),
        });
        setExplanation({ state: "done", text: r.explanation });
      } catch (e) {
        setExplanation({ state: "error", text: e instanceof Error ? e.message : "Erro ao gerar a explicação." });
      }
    },
    [prefs.level],
  );

  useEffect(() => {
    if (input && ready) loadPlan(input);
  }, [input, ready, loadPlan]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!questions) return;
    const term = Math.round(Number(months));
    if (!Number.isFinite(term) || term < 1 || term > 600) return setError("Informe por quantos meses o dinheiro pode ficar aplicado.");
    const full = { ...answers, prazo: prazoFromMonths(term) };
    if (questions.some((q) => full[q.key as keyof AdvisorAnswers] == null)) return setError("Responda todas as perguntas.");
    const value = parseMoney(amount);
    if (value <= 0) return setError("Informe quanto quer investir.");
    setError("");
    const inp: AdvisorInput = {
      answers: full as AdvisorAnswers,
      amount: value,
      months: term,
      monthly_contribution: parseMoney(contribution),
      monthly_expenses: parseMoney(expenses),
      has_reserve: hasReserve,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(inp));
    } catch {}
    setInput(inp);
  }

  function redo() {
    if (input) {
      setAnswers(input.answers);
      setAmount(formatNumber(input.amount));
      setContribution(input.monthly_contribution ? formatNumber(input.monthly_contribution) : "");
      setExpenses(input.monthly_expenses ? formatNumber(input.monthly_expenses) : "");
      setHasReserve(input.has_reserve);
      setMonths(input.months ? String(input.months) : "");
    }
    setInput(null);
    setPlan(null);
  }

  if (error && !questions) {
    return <Card className="text-sm text-muted">{error}</Card>;
  }

  if (!input) {
    return (
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-1 text-lg font-bold">Seu perfil de investidor</h2>
          <p className="mb-6 text-sm text-muted">As respostas definem quanto risco o plano pode ter. Ficam só neste navegador.</p>
          <div className="flex flex-col gap-7">
            {(questions ?? []).filter((q) => q.key !== "prazo").map((q, qi) => (
              <fieldset key={q.key}>
                <legend className="mb-3 font-semibold">
                  {qi + 1}. {q.label}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o, i) => {
                    const active = answers[q.key as keyof AdvisorAnswers] === i;
                    return (
                      <button
                        type="button"
                        key={o}
                        onClick={() => setAnswers((a) => ({ ...a, [q.key]: i }))}
                        className={`rounded-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                          active ? "bg-accent-bg text-accent-text ring-1 ring-accent-text/40" : "bg-track text-text hover:bg-surface-2"
                        }`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>
        <Card className="h-fit">
          <h2 className="mb-5 text-lg font-bold">Seu dinheiro</h2>
          <div className="flex flex-col gap-4">
            <MoneyField label="Quanto quer investir agora" value={amount} onChange={setAmount} required />
            {portfolio && portfolio.total > 0 && (
              <button
                type="button"
                onClick={() => setAmount(formatNumber(portfolio.total))}
                className="-mt-2 w-fit text-left text-xs font-semibold text-accent-text hover:underline"
              >
                Usar o total da minha carteira ({formatBRL(portfolio.total)})
              </button>
            )}
            <div className="flex flex-col gap-2 text-sm font-semibold">
              <label htmlFor="months">Por quantos meses o dinheiro pode ficar aplicado?</label>
              <span className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-primary">
                <input
                  id="months"
                  inputMode="numeric"
                  value={months}
                  required
                  onChange={(e) => setMonths(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder="Ex.: 24"
                  className="w-full bg-transparent font-normal outline-none"
                />
                <span className="text-muted">meses</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {MONTH_PRESETS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMonths(String(m))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      months === String(m) ? "bg-accent-bg text-accent-text ring-1 ring-accent-text/40" : "bg-track text-text"
                    }`}
                  >
                    {monthsLabel(m)}
                  </button>
                ))}
              </div>
            </div>
            <MoneyField label="Quanto consegue investir por mês (opcional)" value={contribution} onChange={setContribution} />
            <MoneyField label="Quanto gasta por mês (para a reserva)" value={expenses} onChange={setExpenses} />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={hasReserve} onChange={(e) => setHasReserve(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
              Já tenho reserva de emergência separada
            </label>
            {error && <p className="text-sm text-negative">{error}</p>}
            <button type="submit" className="mt-2 flex items-center justify-center gap-2 rounded-full bg-primary py-4 font-semibold text-on-primary">
              <Sparkles size={18} /> Montar meu plano
            </button>
            <p className="text-xs text-muted">
              Sugestões automáticas a partir do seu perfil. Todo investimento tem riscos; confira custos e impostos antes de aplicar.
            </p>
          </div>
        </Card>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={redo} className="inline-flex items-center gap-2 rounded-full bg-track px-4 py-2 text-sm font-semibold">
          <ArrowLeft size={16} /> Refazer perfil e valores
        </button>
        {plan && (
          <span className="text-sm text-muted">
            Selic {formatNumber(plan.macro.selic ?? 0)}% · IPCA {formatNumber(plan.macro.ipca_12m ?? 0)}% · juro real{" "}
            {formatNumber(plan.macro.juro_real ?? 0)}%
          </span>
        )}
      </div>

      {!plan ? (
        <Card className="text-sm text-muted">{error || "Montando o plano..."}</Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card>
              <div className="mb-2 flex items-center gap-2 text-sm text-muted">
                <ShieldCheck size={16} /> Seu perfil
              </div>
              <div className="text-3xl font-bold capitalize">{plan.profile}</div>
              <p className="mt-2 text-sm text-muted">{PROFILE_TEXT[plan.profile]}</p>
              {plan.months && (
                <div className="mt-3 inline-flex rounded-full bg-accent-bg px-3 py-1 text-xs font-semibold text-accent-text">
                  {monthsLabel(plan.months)} · {plan.term_label.toLowerCase()}
                </div>
              )}
              <div className="mt-6 flex flex-col items-center gap-2">
                <Donut
                  size={190}
                  slices={plan.allocation.map((a) => ({ label: `${a.label}: ${a.pct}%`, value: a.pct, color: CLASS_COLOR[a.key] }))}
                  center={
                    <>
                      <span className="tabular text-lg font-bold">{formatBRL(plan.amount)}</span>
                      <span className="text-xs text-muted">total</span>
                    </>
                  }
                />
                <div className="text-center text-sm text-muted">
                  {formatNumber(100 - plan.variable_income_pct)}% renda fixa · {formatNumber(plan.variable_income_pct)}% em ações, fundos e dólar
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.allocation.map((a) => (
                  <li key={a.key} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CLASS_COLOR[a.key] }} />
                    <span className="flex-1">{a.label}</span>
                    <span className="tabular font-semibold">{formatNumber(a.pct)}%</span>
                  </li>
                ))}
              </ul>
            </Card>

            <section className="rounded-card border border-border bg-gradient-to-br from-surface-2 to-surface p-5 md:p-6">
              <h2 className="mb-3 flex items-center gap-2.5 font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent-text">
                  <Sparkles size={16} />
                </span>
                O assessor explica seu plano
              </h2>
              {explanation?.state === "loading" && (
                <div className="space-y-2">
                  {[92, 100, 80, 95, 60].map((w, i) => (
                    <div key={i} style={{ width: `${w}%` }} className="h-3.5 animate-pulse rounded-full bg-track" />
                  ))}
                </div>
              )}
              {explanation && explanation.state !== "loading" && (
                <Markdown
                  text={explanation.text}
                  className={`text-sm leading-relaxed text-text/90 md:text-[15px] ${explanation.state === "error" ? "opacity-80" : ""}`}
                />
              )}
              {plan.notes.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-muted">
                  {plan.notes.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.allocation.map((a) => (
              <Card key={a.key} className="!p-6">
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: CLASS_COLOR[a.key] }} />
                  <h3 className="font-bold">{a.label}</h3>
                </div>
                <div className="tabular text-2xl font-bold">{formatBRL(a.value)}</div>
                <div className="mb-3 text-xs text-muted">
                  {formatNumber(a.pct)}% · risco {a.risk.toLowerCase()}
                </div>
                <p className="mb-3 text-sm">{a.why}</p>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Onde aplicar</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {a.products.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
                <Picks allocation={a} plan={plan} />
              </Card>
            ))}
          </div>

          {plan.monthly_contribution && (
            <Card>
              <h2 className="mb-3 text-lg font-bold">Como dividir o que você guarda por mês</h2>
              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                {plan.monthly_contribution.map((c) => (
                  <div key={c.key}>
                    <div className="tabular text-lg font-bold">{formatBRL(c.value)}</div>
                    <div className="text-muted">{c.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {portfolio && portfolio.total > 0 ? (
            <InfoBanner>
              O assessor conhece a carteira que você importou ({formatBRL(portfolio.total)} em {portfolio.positions.length} investimentos). Veja
              quanto falta ou sobra em cada classe em <Link href="/carteira" className="underline">Minha carteira</Link>.
            </InfoBanner>
          ) : (
            <InfoBanner>
              Já investe? Importe os prints da sua corretora em <Link href="/carteira" className="underline">Minha carteira</Link> para o
              assessor comparar o que você tem com este plano.
            </InfoBanner>
          )}

          <div>
            <h2 className="mb-3 text-lg font-bold">Converse com o assessor</h2>
            <Chat
              endpoint="/assessor/chat"
              extra={{ plan, portfolio: portfolio && { ...portfolio, disclaimer: undefined } }}
              page="/assessor"
              suggestions={[
                "Por onde eu começo na prática?",
                "Por que essas ações para o meu prazo?",
                "Qual CDB ou Tesouro escolher para a parte de renda fixa?",
                "Vale a pena ter dólar agora?",
                "Quais FIIs combinam com o meu perfil?",
                ...(portfolio ? ["Como aproximo minha carteira atual deste plano?"] : []),
              ]}
              placeholder="Pergunte ao assessor sobre o seu plano"
              footer="Sugestões automáticas. Todo investimento tem riscos; rentabilidade passada não garante futura."
            />
          </div>

          <InfoBanner>{plan.disclaimer}</InfoBanner>
        </>
      )}
    </div>
  );
}

/** Ações ou FIIs do app para curto, médio e longo prazo, com o valor sugerido por ativo no prazo da pessoa. */
function Picks({ allocation: a, plan }: { allocation: AdvisorAllocation; plan: AdvisorPlan }) {
  const terms = (Object.keys(plan.terms) as AdvisorTerm[]).filter((t) => a.picks[t]?.length);
  const [term, setTerm] = useState<AdvisorTerm>(terms.includes(plan.term) ? plan.term : terms[0]);
  if (!terms.length) return null;
  const isMine = term === plan.term && a.suggested.length > 0;
  const list = isMine ? a.suggested : (a.picks[term] ?? []).slice(0, 5);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sugestões</div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist">
        {terms.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={term === t}
            onClick={() => setTerm(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${term === t ? "bg-accent-bg text-accent-text ring-1 ring-accent-text/40" : "bg-track text-text"}`}
          >
            {t === "curto" ? "Curto" : t === "medio" ? "Médio" : "Longo"}
            {t === plan.term ? " · seu prazo" : ""}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{plan.terms[term]}</p>
      <div className="mt-2 flex flex-col gap-2">
        {list.map((x) => (
          <Link key={x.ticker} href={`/ativo/${x.ticker}`} className="flex items-center gap-2 text-sm hover:opacity-80">
            <AssetLogo ticker={x.ticker} src={x.logo_url} size={28} />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{x.ticker}</span>
              <span className="block truncate text-xs text-muted">{x.note}</span>
            </span>
            {isMine && x.value != null && <span className="tabular font-semibold">{formatBRL(x.value)}</span>}
          </Link>
        ))}
      </div>
      {isMine && a.suggested_rest != null && a.suggested_rest > 1 && (
        <p className="mt-2 text-xs text-muted">
          {formatBRL(a.suggested_rest)} restantes num fundo que acompanha a bolsa (ETF), para não passar de 10% do total em um só investimento.
        </p>
      )}
      {!isMine && term !== plan.term && (
        <p className="mt-2 text-xs text-muted">Para outro prazo: só para comparar, sem valor sugerido.</p>
      )}
    </div>
  );
}
