"use client";

import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/components/AppProvider";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Card, InfoBanner } from "@/app/components/ui";
import { apiFetch, type AdvisorAnswers, type AdvisorInput, type AdvisorPlan, type AdvisorQuestion } from "@/lib/api";
import { formatBRL, formatNumber } from "@/lib/format";
import { Chat } from "../assistente/Chat";

const KEY = "aivesting.assessor";

const PROFILE_TEXT = {
  conservador: "Prioriza segurança e liquidez. A maior parte fica em renda fixa.",
  moderado: "Equilibra segurança e crescimento, com uma parte relevante em renda variável.",
  arrojado: "Aceita oscilações fortes em busca de mais retorno no longo prazo.",
};

// Cores das classes na barra de alocação: tons do bege ao preto, do menor ao maior risco.
const CLASS_COLOR: Record<string, string> = {
  reserva: "#E9DDC4",
  rf_pos: "#D6BE8C",
  rf_ipca: "#B8945A",
  fiis: "#8A6A3A",
  internacional: "#5A4630",
  acoes: "#111111",
};

function loadSaved(): AdvisorInput | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseMoney(v: string) {
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
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
  const [input, setInput] = useState<AdvisorInput | null>(null);
  const [plan, setPlan] = useState<AdvisorPlan | null>(null);
  const [explanation, setExplanation] = useState<{ state: "loading" | "done" | "error"; text: string } | null>(null);

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
    if (questions.some((q) => answers[q.key as keyof AdvisorAnswers] == null)) return setError("Responda todas as perguntas.");
    const value = parseMoney(amount);
    if (value <= 0) return setError("Informe quanto quer investir.");
    setError("");
    const inp: AdvisorInput = {
      answers: answers as AdvisorAnswers,
      amount: value,
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
            {(questions ?? []).map((q, qi) => (
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
                          active ? "bg-primary text-on-primary" : "bg-track text-text hover:bg-track/70"
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
              <div className="mt-6 text-sm">
                <div className="tabular text-2xl font-bold">{formatBRL(plan.amount)}</div>
                <div className="text-muted">
                  {formatNumber(100 - plan.variable_income_pct)}% renda fixa · {formatNumber(plan.variable_income_pct)}% renda variável
                </div>
              </div>
              <div className="mt-4 flex h-4 overflow-hidden rounded-full">
                {plan.allocation.map((a) => (
                  <div key={a.key} title={`${a.label}: ${a.pct}%`} style={{ width: `${a.pct}%`, background: CLASS_COLOR[a.key] }} />
                ))}
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

            <section className="rounded-card bg-primary p-6 text-on-primary md:p-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent-text">
                  <Sparkles size={16} />
                </span>
                O assessor explica seu plano
              </h2>
              {explanation?.state === "loading" && (
                <div className="space-y-2">
                  {[92, 100, 80, 95, 60].map((w, i) => (
                    <div key={i} style={{ width: `${w}%` }} className="h-3.5 animate-pulse rounded-full bg-on-primary/15" />
                  ))}
                </div>
              )}
              {explanation && explanation.state !== "loading" && (
                <p className={`whitespace-pre-line text-sm leading-relaxed md:text-[15px] ${explanation.state === "error" ? "opacity-80" : ""}`}>
                  {explanation.text}
                </p>
              )}
              {plan.notes.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-on-primary/15 pt-4 text-sm opacity-90">
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
                {a.examples.length > 0 && (
                  <>
                    <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Destaques do app</div>
                    <div className="mt-2 flex flex-col gap-2">
                      {a.examples.map((x) => (
                        <Link key={x.ticker} href={`/ativo/${x.ticker}`} className="flex items-center gap-2 text-sm hover:opacity-80">
                          <AssetLogo ticker={x.ticker} src={x.logo_url} size={28} />
                          <span className="font-semibold">{x.ticker}</span>
                          <span className="truncate text-xs text-muted">{x.note}</span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>

          {plan.monthly_contribution && (
            <Card>
              <h2 className="mb-3 text-lg font-bold">Aporte mensal sugerido</h2>
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

          <div>
            <h2 className="mb-3 text-lg font-bold">Converse com o assessor</h2>
            <Chat
              endpoint="/assessor/chat"
              extra={{ plan }}
              page="/assessor"
              suggestions={[
                "Por onde eu começo na prática?",
                "Qual CDB ou Tesouro escolher para a parte de renda fixa?",
                "Vale a pena ter dólar agora?",
                "Quais FIIs combinam com o meu perfil?",
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

function MoneyField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold">
      {label}
      <span className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-primary">
        <span className="text-muted">R$</span>
        <input
          inputMode="decimal"
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          className="w-full bg-transparent font-normal outline-none"
        />
      </span>
    </label>
  );
}
