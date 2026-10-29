"use client";

import { Calculator, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MoneyField, parseMoney } from "@/app/components/fields";
import { Term } from "@/app/components/Term";
import { Card, CardHeader, InfoBanner } from "@/app/components/ui";
import { apiFetch, type SimulationInput, type SimulationResult, type SimulationStrategy } from "@/lib/api";
import { formatBRL, formatMonth, formatNumber, formatProbability } from "@/lib/format";

const KEY = "aivesting.simulador";
const YEAR_PRESETS = [1, 3, 5, 8, 10, 15, 20];

const COMPONENT_COLOR: Record<string, string> = {
  cdi: "rgb(var(--chart-2))",
  ibov: "rgb(var(--chart-1))",
  dolar: "rgb(var(--chart-3))",
};

function loadSaved(): SimulationInput | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const plural = (y: number) => (y === 1 ? "1 ano" : `${y} anos`);
const money = (v: number | null | undefined) => (v == null ? "–" : formatBRL(Math.round(v)).replace(/,00$/, ""));

export function Simulator() {
  const [goal, setGoal] = useState("");
  const [initial, setInitial] = useState("");
  const [monthly, setMonthly] = useState("");
  const [years, setYears] = useState(5);
  const [adjust, setAdjust] = useState(true);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (input: SimulationInput) => {
    setLoading(true);
    setError("");
    try {
      setResult(await apiFetch<SimulationResult>("/simulador", { method: "POST", body: JSON.stringify(input) }));
      try {
        localStorage.setItem(KEY, JSON.stringify(input));
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao simular.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = loadSaved();
    if (!saved) return;
    setGoal(saved.goal ? formatNumber(saved.goal) : "");
    setInitial(saved.initial ? formatNumber(saved.initial) : "");
    setMonthly(saved.monthly ? formatNumber(saved.monthly) : "");
    setYears(saved.years);
    setAdjust(saved.adjust_contributions);
    run(saved);
  }, [run]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: SimulationInput = {
      initial: parseMoney(initial),
      monthly: parseMoney(monthly),
      years,
      goal: parseMoney(goal) || null,
      adjust_contributions: adjust,
    };
    if (!input.initial && !input.monthly) {
      setError("Informe um valor inicial ou um aporte mensal.");
      return;
    }
    run(input);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <MoneyField label="Sua meta (opcional)" value={goal} onChange={setGoal} />
          <MoneyField label="Quanto já tem para começar" value={initial} onChange={setInitial} />
          <MoneyField label="Quanto consegue aportar por mês" value={monthly} onChange={setMonthly} />
          <div className="flex flex-col gap-2 text-sm font-semibold">
            Em quanto tempo
            <div className="flex flex-wrap gap-2">
              {YEAR_PRESETS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYears(y)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    y === years ? "border-primary bg-primary text-on-primary" : "border-border text-muted hover:text-text"
                  }`}
                >
                  {plural(y)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={adjust}
              onChange={(e) => setAdjust(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]"
            />
            Corrigir o aporte pela inflação todo ano (o esforço fica igual em dinheiro de hoje)
          </label>
          {error && <p className="text-sm text-negative">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-full bg-primary py-4 font-semibold text-on-primary disabled:opacity-60"
          >
            <Calculator size={18} /> {loading ? "Simulando..." : "Simular"}
          </button>
          <p className="text-xs text-muted">
            Valores em dinheiro de hoje, já descontada a inflação (IPCA). Sem custos, impostos nem taxas.
          </p>
        </form>
      </Card>

      <div className="flex flex-col gap-6">
        {result ? <Results result={result} /> : <Intro />}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <Card>
      <CardHeader title="Como funciona" />
      <div className="flex flex-col gap-3 text-sm text-muted">
        <p>
          O simulador repete o seu plano em cada mês de início possível desde 2000: entra com o valor inicial, aporta
          todo mês e vê quanto teria no fim do prazo em cinco carteiras, da renda fixa pura até só ações.
        </p>
        <p>
          Assim você vê o pior caso, o típico e o melhor caso do que já aconteceu, e quantas vezes o plano teria
          batido a meta. Não é previsão: o futuro pode ser pior que o pior caso do passado.
        </p>
      </div>
    </Card>
  );
}

function Results({ result }: { result: SimulationResult }) {
  const usable = result.strategies.filter((s) => s.enough_history);
  if (!usable.length) {
    return (
      <Card className="text-sm text-muted">
        O histórico ainda não tem janelas suficientes de {plural(result.years)} para simular. Tente um prazo menor.
      </Card>
    );
  }
  const invested = usable[0].invested ?? 0;
  // A escala começa perto do pior caso para as faixas não ficarem espremidas à direita.
  const scaleMax = Math.max(...usable.map((s) => s.best ?? 0), result.goal ?? 0) * 1.03;
  const scaleMin = Math.min(...usable.map((s) => s.worst ?? 0), result.goal ?? Infinity, invested) * 0.95;
  const safest = [...usable].sort((a, b) => (b.p10 ?? 0) - (a.p10 ?? 0))[0];
  const typical = [...usable].sort((a, b) => (b.median ?? 0) - (a.median ?? 0))[0];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Highlight label="Você vai investir" value={money(invested)} sub={`em ${plural(result.years)}, em dinheiro de hoje`} />
        <Highlight
          label="Maior resultado típico"
          value={money(typical.median)}
          sub={`${typical.label}: metade dos períodos terminou acima disso`}
        />
        <Highlight
          label="Mais protegida nos piores casos"
          value={money(safest.p10)}
          sub={`${safest.label}: em 9 de cada 10 períodos terminou acima disso`}
        />
      </div>

      <Card>
        <CardHeader
          title="Quanto você teria no fim do prazo"
          subtitle={`${usable[0].windows} períodos de ${plural(result.years)}, começando entre ${formatMonth(result.first_start!)} e ${formatMonth(result.last_start!)}`}
        />
        <ul className="flex flex-col divide-y divide-border">
          {result.strategies.map((s) => (
            <StrategyRow key={s.key} s={s} result={result} scale={[scaleMin, scaleMax]} />
          ))}
        </ul>
        <Legend hasGoal={!!result.goal} />
      </Card>

      {result.goal ? <GoalCard result={result} usable={usable} /> : null}

      <InfoBanner>{result.disclaimer}</InfoBanner>
    </>
  );
}

function Highlight({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted">{sub}</div>
    </Card>
  );
}

function Composition({ s, labels }: { s: SimulationStrategy; labels: Record<string, string> }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {Object.entries(s.weights).map(([k, w]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COMPONENT_COLOR[k] }} />
          {Math.round(w * 100)}% {labels[k] ?? k}
        </span>
      ))}
    </div>
  );
}

function StrategyRow({ s, result, scale: [lo, hi] }: { s: SimulationStrategy; result: SimulationResult; scale: [number, number] }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[220px_1fr_150px] md:items-center">
      <div>
        <div className="font-semibold">{s.label}</div>
        <Composition s={s} labels={result.components} />
      </div>
      {s.enough_history ? (
        <>
          <div className="relative h-8" aria-hidden>
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-track" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-chart-4"
              style={{ left: pos(s.worst!), width: `calc(${pos(s.best!)} - ${pos(s.worst!)})` }}
            />
            <div
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary"
              style={{ left: pos(s.p10!), width: `calc(${pos(s.p90!)} - ${pos(s.p10!)})` }}
            />
            <div className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text" style={{ left: pos(s.median!) }} />
            <div className="absolute top-0 h-8 w-px bg-chart-2/50" style={{ left: pos(s.invested!) }} title="Total investido" />
            {result.goal ? (
              <div className="absolute top-0 h-8 w-0.5 bg-positive" style={{ left: pos(result.goal) }} title="Meta" />
            ) : null}
          </div>
          <div className="text-sm md:text-right">
            <div className="tabular font-bold">{money(s.median)}</div>
            <div className="tabular text-xs text-muted">
              de {money(s.worst)} a {money(s.best)}
            </div>
            {s.goal_hit_rate != null && (
              <div className="tabular text-xs font-semibold text-accent-text">meta em {formatProbability(s.goal_hit_rate)}</div>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted md:col-span-2">
          Sem histórico suficiente para {plural(result.years)} (a cotação do dólar no app começa em 2006).
        </p>
      )}
    </li>
  );
}

function Legend({ hasGoal }: { hasGoal: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-5 rounded-full bg-chart-4" /> pior ao melhor caso
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-full bg-primary" /> 8 de cada 10 períodos
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3.5 w-1 rounded-full bg-text" /> <Term k="mediana">resultado típico (mediana)</Term>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3.5 w-px bg-chart-2/50" /> total investido
      </span>
      {hasGoal && (
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-0.5 bg-positive" /> meta
        </span>
      )}
    </div>
  );
}

function GoalCard({ result, usable }: { result: SimulationResult; usable: SimulationStrategy[] }) {
  return (
    <Card>
      <CardHeader
        title={`Para chegar em ${money(result.goal)} em ${plural(result.years)}`}
        subtitle="Aporte mensal que teria batido a meta em pelo menos 8 de cada 10 períodos do histórico"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {usable.map((s) => {
          const needed = s.needed_monthly_80;
          const ok = needed != null && needed <= result.monthly;
          return (
            <div key={s.key} className="rounded-xl border border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Target size={15} className={ok ? "text-positive" : "text-muted"} /> {s.label}
              </div>
              <div className="tabular mt-1 text-lg font-bold">{needed == null ? "–" : `${money(needed)}/mês`}</div>
              <div className="text-xs text-muted">
                {needed == null
                  ? "Não alcança a meta nesse prazo"
                  : needed === 0
                    ? "O valor inicial já basta"
                    : ok
                      ? "Seu aporte atual já basta"
                      : `${money(needed - result.monthly)} a mais que o seu aporte`}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
