"use client";

import { ArrowRight, Check, Coins, Flame, RefreshCw, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch, type PortfolioDividends } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { JOURNEY_EVENT, LEVELS, dividendsPay, journeyState, loadJourney, monthKey, recordHistory, saveJourney } from "@/lib/journey";
import { PORTFOLIO_EVENT } from "@/lib/portfolio";
import { useApp } from "./AppProvider";
import { Markdown } from "./Markdown";
import { MoneyField, finishMoney, parseMoney } from "./fields";
import { QuickPlan } from "./QuickPlan";
import { Card, CardHeader } from "./ui";

type State = ReturnType<typeof journeyState>;

export type Today = { lines: { label: string; value: string; note?: string }[]; updated?: string };

function useJourney() {
  const [state, setState] = useState<State | null>(null);
  const refresh = useCallback(() => setState(journeyState()), []);
  useEffect(() => {
    refresh();
    window.addEventListener(JOURNEY_EVENT, refresh);
    window.addEventListener(PORTFOLIO_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(JOURNEY_EVENT, refresh);
      window.removeEventListener(PORTFOLIO_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (state?.fromPortfolio) recordHistory(state.total);
  }, [state?.fromPortfolio, state?.total]);
  return state;
}

/** A tela inicial: nível do patrimônio, meses seguidos guardando e a próxima missão. */
export function Journey({ today, highlights }: { today: Today; highlights?: ReactNode }) {
  const state = useJourney();
  const { prefs } = useApp();
  if (!state) return <div className="h-64 animate-pulse rounded-card bg-surface-2" />;
  const { level, total, fromPortfolio, months, missions } = state;
  const done = missions.filter((m) => m.done).length;
  const next = missions.find((m) => !m.done);
  const name = prefs.name.trim();

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card bg-nav p-6 text-white md:p-8">
        <div className="mb-1 text-sm text-nav-text">{name ? `Olá, ${name}` : "Sua jornada"}</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Trophy size={16} /> Nível {level.index + 1} · {level.level.name}
            </div>
            <div className="tabular mt-1 text-4xl font-bold">{formatBRL(total)}</div>
            <div className="mt-1 text-xs text-nav-text">
              {fromPortfolio ? "seu patrimônio, pela sua carteira" : total > 0 ? "soma do que você registrou" : "comece registrando quanto guardou"}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
            <Flame size={26} className={months ? "text-primary" : "text-nav-muted"} />
            <div>
              <div className="tabular text-2xl font-bold leading-none">{months}</div>
              <div className="text-xs text-nav-text">{months === 1 ? "mês seguido guardando" : "meses seguidos guardando"}</div>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <div className="h-3 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(3, level.progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-nav-text">
            <span>{level.level.name}</span>
            <span>
              {level.next
                ? `faltam ${formatBRL(level.next.min - total)} para o nível ${level.index + 2} · ${level.next.name}`
                : "último nível. Parabéns!"}
            </span>
          </div>
        </div>
      </section>

      <InvestNow />

      {highlights}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {next && (
            <Card className="border-primary/60 bg-gradient-to-br from-accent-bg to-surface">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent-text">Próxima missão</div>
              <div className="text-xl font-bold">{next.title}</div>
              <p className="mt-1 text-sm text-muted">{next.why}</p>
              <Link
                href={next.href}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
              >
                {next.cta} <ArrowRight size={16} />
              </Link>
            </Card>
          )}
          <SavedThisMonth />
          <CoachCard state={state} />
          <Card>
            <CardHeader title="Missões" subtitle={`${done} de ${missions.length} cumpridas`} />
            <ol className="flex flex-col gap-1">
              {missions.map((m, i) => (
                <li key={m.key}>
                  <Link href={m.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        m.done ? "bg-positive text-white" : "bg-track text-muted"
                      }`}
                    >
                      {m.done ? <Check size={15} /> : i + 1}
                    </span>
                    <span className={`flex-1 text-sm ${m.done ? "text-muted line-through" : "font-semibold"}`}>{m.title}</span>
                    {!m.done && <ArrowRight size={15} className="text-muted" />}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <DividendsSnowball holdings={state.holdings} />
          <Card>
            <CardHeader title="Como está hoje" subtitle={today.updated && `Última atualização: ${today.updated}`} />
            <ul className="flex flex-col gap-3 text-sm">
              {today.lines.map((l) => (
                <li key={l.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">{l.label}</span>
                  <span className="text-right font-semibold">
                    {l.value}
                    {l.note && <span className="block text-xs font-normal text-muted">{l.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/mercado" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
              Ver mais em Mercado <ArrowRight size={14} />
            </Link>
          </Card>
          <Card>
            <CardHeader title="Os níveis" />
            <ol className="flex flex-col gap-1.5 text-sm">
              {LEVELS.map((l, i) => (
                <li key={l.name} className={`flex justify-between ${i === level.index ? "font-bold text-text" : i < level.index ? "text-muted" : "text-muted/70"}`}>
                  <span>
                    {i + 1}. {l.name}
                  </span>
                  <span className="tabular">{l.min ? formatBRL(l.min).replace(/,00$/, "") : "início"}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <p className="text-xs text-muted">
        A jornada premia guardar dinheiro todo mês, ter reserva e não colocar tudo num lugar só. Ela não premia comprar e vender.
      </p>
    </div>
  );
}

/** "Quanto você guardou este mês?": é o que mantém a sequência de meses. */
function SavedThisMonth() {
  const key = monthKey();
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const v = loadJourney().saved[key] ?? null;
    setSaved(v);
    setValue(v ? finishMoney(String(v).replace(".", ",")) : "");
  }, [key]);
  const month = new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString("pt-BR", { month: "long" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseMoney(value);
    if (n <= 0) return;
    const j = loadJourney();
    saveJourney({ ...j, saved: { ...j.saved, [key]: n } });
    setSaved(n);
    setEditing(false);
  }

  return (
    <div id="guardei">
      <Card>
        <CardHeader title={`Quanto você guardou em ${month}?`} subtitle="Qualquer valor conta: o que importa é guardar todo mês." />
        {saved && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <Coins size={18} className="text-accent-text" />
              Registrado: <strong>{formatBRL(saved)}</strong> em {month}. Volte no mês que vem para manter a sequência.
            </p>
            <button onClick={() => setEditing(true)} className="text-sm font-semibold text-accent-text hover:underline">
              Corrigir
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <MoneyField label="Valor guardado este mês" value={value} onChange={setValue} />
            </div>
            <button type="submit" className="rounded-full bg-primary px-6 py-3 font-semibold text-on-primary">
              Registrar
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

/** Quanto os dividendos já pagam por mês, em contas do dia a dia. */
function DividendsSnowball({ holdings }: { holdings: State["holdings"] }) {
  const [data, setData] = useState<PortfolioDividends | null>(null);
  const eligible = holdings.filter((h) => (h.asset_class === "acoes" || h.asset_class === "fiis") && h.ticker && h.quantity);
  const sig = eligible.map((h) => `${h.ticker}:${h.quantity}`).join(",");
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    apiFetch<PortfolioDividends>("/carteira/proventos", { method: "POST", body: JSON.stringify({ holdings }) })
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sig]);

  const pays = data ? dividendsPay(data.monthly_avg) : null;
  return (
    <Card>
      <CardHeader title="Bola de neve dos dividendos" />
      {data && data.monthly_avg > 0 ? (
        <p className="text-sm">
          Seus dividendos rendem cerca de <strong>{formatBRL(data.monthly_avg)} por mês</strong>
          {pays ? (
            <>
              : já pagam <strong>{pays}</strong>.
            </>
          ) : (
            "."
          )}{" "}
          Quanto mais você guarda, mais essa conta cresce sozinha.
        </p>
      ) : (
        <p className="flex gap-2 text-sm text-muted">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-accent-text" />
          Ações e fundos imobiliários dividem parte do lucro com você todo mês ou trimestre. Coloque a sua carteira no app para ver
          quanto já recebe.
        </p>
      )}
    </Card>
  );
}

const COACH_KEY = "aivesting.jornada.resumo";

function prevKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Resumo do mês feito pela IA "treinadora". Guardado por mês: só gera de novo quando a pessoa pede. */
function CoachCard({ state }: { state: State }) {
  const { prefs } = useApp();
  const month = monthKey();
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const run = useCallback(async () => {
    const { level, total, months, missions, journey } = journeyState();
    setStatus("loading");
    try {
      const r = await apiFetch<{ summary: string }>(`/ia/treinadora?nivel=${prefs.level}`, {
        method: "POST",
        body: JSON.stringify({
          month,
          level: level.index + 1,
          level_name: level.level.name,
          total,
          next_level_name: level.next?.name ?? null,
          to_next_level: level.next ? level.next.min - total : null,
          streak_months: months,
          saved_this_month: journey.saved[month] ?? 0,
          saved_last_month: journey.saved[prevKey(month)] ?? 0,
          next_mission: missions.find((m) => !m.done)?.title ?? null,
          missions_done: missions.filter((m) => m.done).length,
          missions_total: missions.length,
        }),
      });
      setText(r.summary);
      setStatus("idle");
      try {
        localStorage.setItem(COACH_KEY, JSON.stringify({ month, text: r.summary }));
      } catch {}
    } catch {
      setStatus("error");
    }
  }, [month, prefs.level]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COACH_KEY) ?? "null");
      if (saved?.month === month) return setText(saved.text);
    } catch {}
    if (prefs.aiAuto && state.total > 0) run();
    // Só na abertura da tela: depois, só quando a pessoa pede.
  }, []);

  return (
    <section className="rounded-card border border-border bg-gradient-to-br from-surface-2 to-surface p-5 md:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent-text">
            <Sparkles size={16} />
          </span>
          Resumo do mês da sua treinadora
        </h2>
        {text && status !== "loading" && (
          <button onClick={run} className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-text">
            <RefreshCw size={13} /> Atualizar
          </button>
        )}
      </div>
      {status === "loading" ? (
        <div className="space-y-2">
          {[92, 100, 70].map((w, i) => (
            <div key={i} style={{ width: `${w}%` }} className="h-3.5 animate-pulse rounded-full bg-track" />
          ))}
        </div>
      ) : text ? (
        <Markdown text={text} className="text-sm leading-relaxed text-text/90 md:text-[15px]" />
      ) : (
        <div>
          <p className="mb-3 text-sm text-muted">
            {status === "error"
              ? "Não deu para falar com a IA agora. Ela pode estar acordando; tente de novo em 1 minuto."
              : "A IA olha quanto você guardou, quanto falta para o próximo nível e qual a próxima missão."}
          </p>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
            <Sparkles size={16} /> Ver o resumo do mês
          </button>
        </div>
      )}
    </section>
  );
}

const TERMS = [
  { months: 6, label: "6 meses" },
  { months: 12, label: "1 ano" },
  { months: 24, label: "2 anos" },
  { months: 36, label: "3 anos" },
  { months: 60, label: "5 anos" },
  { months: 120, label: "10 anos ou mais" },
];

/** "Tem um dinheiro para investir?": valor e prazo bastam para o app mostrar a divisão sugerida hoje. */
function InvestNow() {
  const [value, setValue] = useState("");
  const [months, setMonths] = useState(24);
  const [shown, setShown] = useState<{ amount: number; months: number } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(value);
    if (amount > 0) setShown({ amount, months });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Tem um dinheiro para investir?" subtitle="Diga quanto e por quanto tempo. O app mostra agora onde colocar cada parte." />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
            <MoneyField label="Quanto" value={value} onChange={setValue} />
            <div className="flex flex-col gap-2 text-sm font-semibold">
              Por quanto tempo pode deixar aplicado
              <div className="flex flex-wrap gap-2">
                {TERMS.map((t) => (
                  <button
                    key={t.months}
                    type="button"
                    onClick={() => {
                      setMonths(t.months);
                      if (shown) setShown({ ...shown, months: t.months });
                    }}
                    className={`rounded-full border px-4 py-2 font-normal ${
                      t.months === months ? "border-primary bg-primary text-on-primary" : "border-border text-muted hover:text-text"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button type="submit" className="w-fit rounded-full bg-primary px-6 py-3 font-semibold text-on-primary">
            Mostrar onde investir
          </button>
        </form>
      </Card>
      {shown && <QuickPlan amount={shown.amount} months={shown.months} />}
    </div>
  );
}
