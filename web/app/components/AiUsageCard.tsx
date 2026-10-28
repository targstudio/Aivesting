"use client";

import { Cpu } from "lucide-react";
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

/** Gasto com a IA: totais, gráfico de 14 dias e divisão por função do app. */
export function AiUsageCard() {
  const [data, setData] = useState<AiUsage | null | "error">(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<AiUsage>("/ia/consumo").then(setData).catch(() => setData("error"));
  }, []);

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

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
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
                  d.cost_usd > 0 ? "bg-primary" : "bg-track"
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
