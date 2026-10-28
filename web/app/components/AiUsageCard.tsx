"use client";

import { Cpu, Pencil, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, type AiUsage, type UsageWindow } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { Card } from "./ui";

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const brl = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const tokens = (v: number) => (v >= 1_000_000 ? `${formatNumber(v / 1_000_000)} mi` : v >= 1000 ? `${formatNumber(v / 1000)} mil` : String(v));

function Total({ label, w }: { label: string; w: UsageWindow }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="tabular text-2xl font-bold tracking-tight">{brl(w.cost_brl) || usd(w.cost_usd)}</div>
      <div className="tabular text-xs text-muted">
        {w.cost_brl != null && `${usd(w.cost_usd)} · `}
        {w.calls} chamadas · {tokens(w.input_tokens + w.output_tokens)} tokens
      </div>
    </div>
  );
}

const CREDIT_KEY = "aivesting.creditos";
type Credit = { usd: number; at: string };

function loadCredit(): Credit | null {
  try {
    const raw = localStorage.getItem(CREDIT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Saldo de créditos da Anthropic: a pessoa informa o saldo do console e o app desconta o gasto desde então. */
function CreditBalance({ data, credit, onSave }: { data: AiUsage; credit: Credit | null; onSave: (c: Credit | null) => void }) {
  const [editing, setEditing] = useState(!credit);
  const [value, setValue] = useState(credit ? String(credit.usd).replace(".", ",") : "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    onSave({ usd: n, at: new Date().toISOString() });
    setEditing(false);
  }

  if (editing || !credit) {
    return (
      <form onSubmit={save} className="rounded-2xl bg-track p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <Wallet size={16} /> Quanto crédito você tem na Anthropic?
        </div>
        <p className="mb-3 text-xs text-muted">
          A Anthropic não informa o saldo pela API. Copie o valor de &quot;Credit balance&quot; em{" "}
          <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" className="underline">
            console.anthropic.com → Billing
          </a>{" "}
          e o app desconta o que a IA gastar daqui em diante.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 focus-within:border-primary">
            <span className="text-muted">US$</span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ex.: 25,00"
              aria-label="Saldo de créditos em dólares"
              className="w-full min-w-[6rem] bg-transparent outline-none"
            />
          </span>
          <button type="submit" className="rounded-full bg-primary px-5 py-2 font-semibold text-on-primary">
            Salvar saldo
          </button>
          {credit && (
            <button type="button" onClick={() => setEditing(false)} className="rounded-full px-3 py-2 text-muted">
              Cancelar
            </button>
          )}
        </div>
      </form>
    );
  }

  const spent = data.since_request?.cost_usd ?? 0;
  const left = Math.max(0, credit.usd - spent);
  const pct = Math.min(100, (left / credit.usd) * 100);
  const days = data.avg_daily_usd_7_days > 0 ? Math.floor(left / data.avg_daily_usd_7_days) : null;
  const low = pct <= 20;
  const when = new Date(credit.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-2xl bg-track p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-muted">
            <Wallet size={16} /> Crédito restante (estimado)
          </div>
          <div className={`tabular text-3xl font-bold tracking-tight ${low ? "text-negative" : ""}`}>{usd(left)}</div>
          <div className="tabular text-xs text-muted">
            {data.usd_brl ? `${brl(left * data.usd_brl)} · ` : ""}
            {usd(credit.usd)} informados em {when}, {usd(spent)} gastos desde então
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold"
        >
          <Pencil size={13} /> Atualizar saldo
        </button>
      </div>
      <div
        className="mt-3 h-2 rounded-full bg-surface"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Crédito restante"
      >
        <div className={`h-full rounded-full ${low ? "bg-negative" : "bg-chart-3"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {days == null
          ? "Sem gasto nos últimos 7 dias para estimar quanto tempo dura."
          : `No ritmo dos últimos 7 dias (${usd(data.avg_daily_usd_7_days)} por dia), dura cerca de ${
              days > 365 ? "mais de um ano" : days === 1 ? "1 dia" : `${days} dias`
            }.`}
        {low && " Saldo baixo: recarregue no console da Anthropic para a IA não parar."}
        {data.since_request && !data.since_request.complete &&
          " A API reiniciou depois que você informou o saldo e não tem banco configurado, então parte do gasto pode não estar contada."}
      </p>
    </div>
  );
}

/** Gasto com a IA: totais, gráfico de 14 dias e divisão por função do app. */
export function AiUsageCard() {
  const [data, setData] = useState<AiUsage | null | "error">(null);
  const [hover, setHover] = useState<number | null>(null);
  const [credit, setCredit] = useState<Credit | null | undefined>(undefined);

  useEffect(() => setCredit(loadCredit()), []);

  useEffect(() => {
    if (credit === undefined) return;
    const q = credit ? `?desde=${encodeURIComponent(credit.at)}` : "";
    apiFetch<AiUsage>(`/ia/consumo${q}`).then(setData).catch(() => setData("error"));
  }, [credit]);

  function saveCredit(c: Credit | null) {
    try {
      if (c) localStorage.setItem(CREDIT_KEY, JSON.stringify(c));
      else localStorage.removeItem(CREDIT_KEY);
    } catch {}
    setCredit(c);
  }

  if (data === null) return <Card className="text-sm text-muted">Carregando o consumo de IA...</Card>;
  if (data === "error") return <Card className="text-sm text-negative">Não foi possível ler o consumo de IA.</Card>;

  const max = Math.max(...data.daily.map((d) => d.cost_usd), 0.0001);
  const shown = hover != null ? data.daily[hover] : null;
  const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const topFeature = Math.max(...data.by_feature_30_days.map((f) => f.cost_usd), 0.0001);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Cpu size={20} /> Consumo de IA
        </h2>
        <span className="text-xs text-muted">
          {data.model} · custo estimado pela tabela de preços da Anthropic
          {data.usd_brl ? ` · dólar a R$ ${formatNumber(data.usd_brl)}` : ""}
        </span>
      </div>
      {!data.persisted && (
        <p className="mb-2 text-xs text-muted">
          Sem banco configurado: o histórico recomeça quando a API reinicia.
        </p>
      )}

      <div className="mt-4">
        <CreditBalance data={data} credit={credit ?? null} onSave={saveCredit} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Total label="Hoje" w={data.today} />
        <Total label="Últimos 7 dias" w={data.last_7_days} />
        <Total label="Últimos 30 dias" w={data.last_30_days} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold">Custo por dia (US$)</span>
          <span className="tabular text-muted">
            {shown ? `${dayLabel(shown.day)}: ${usd(shown.cost_usd)} · ${shown.calls} chamadas` : "Passe o dedo ou o mouse nas barras"}
          </span>
        </div>
        <div className="flex h-32 items-end gap-[2px] border-b border-border" onMouseLeave={() => setHover(null)}>
          {data.daily.map((d, i) => (
            <button
              key={d.day}
              type="button"
              aria-label={`${dayLabel(d.day)}: ${usd(d.cost_usd)}, ${d.calls} chamadas`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              className="flex h-full flex-1 items-end"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-opacity ${hover != null && hover !== i ? "opacity-40" : ""} ${
                  d.cost_usd > 0 ? "bg-chart-1" : "bg-track"
                }`}
                style={{ height: d.cost_usd > 0 ? `${Math.max(3, (d.cost_usd / max) * 100)}%` : "2px" }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>{dayLabel(data.daily[0].day)}</span>
          <span>hoje</span>
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-semibold">Por função · últimos 30 dias</div>
        {data.by_feature_30_days.length ? (
          <ul className="space-y-3">
            {data.by_feature_30_days.map((f) => (
              <li key={f.feature} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span>{f.label}</span>
                  <span className="tabular whitespace-nowrap text-muted">
                    {f.calls} · <span className="font-semibold text-text">{brl(f.cost_brl) || usd(f.cost_usd)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-track">
                  <div className="h-full rounded-full bg-accent-text" style={{ width: `${(f.cost_usd / topFeature) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{data.ai ? "Nenhuma chamada à IA ainda." : "A IA ainda não está ligada (falta a ANTHROPIC_API_KEY na API)."}</p>
        )}
      </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        {data.cache_hits_since_start} leituras servidas do cache desde que a API ligou, sem custo extra. Os valores são
        estimativas; o valor cobrado de fato aparece no console da Anthropic.
      </p>
    </Card>
  );
}
