"use client";

import { ChartCandlestick } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/app/components/ui";
import { fmtPct, getCandles, type CandleData } from "@/lib/trading";
import { CandleChart } from "./CandleChart";

const PERIODS = [
  { key: "hoje", label: "Hoje", days: 0 },
  { key: "1m", label: "1 mês", days: 22 },
  { key: "6m", label: "6 meses", days: 126 },
  { key: "1a", label: "1 ano", days: 252 },
  { key: "5a", label: "5 anos", days: 1260 },
] as const;
type Period = (typeof PERIODS)[number]["key"];

/** Gráfico de preço da tela do ativo: linha simples por padrão, candles para quem quiser, e atalho para o Trading. */
export function AssetPriceChart({ ticker }: { ticker: string }) {
  const [period, setPeriod] = useState<Period>("6m");
  const [mode, setMode] = useState<"area" | "candle">("area");
  const [daily, setDaily] = useState<CandleData | null>(null);
  const [intraday, setIntraday] = useState<CandleData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getCandles(ticker, "1d").then(setDaily).catch(() => setFailed(true));
  }, [ticker]);
  useEffect(() => {
    if (period === "hoje" && !intraday) getCandles(ticker, "5m").then(setIntraday).catch(() => setFailed(true));
  }, [period, intraday, ticker]);

  const view = useMemo(() => {
    if (period === "hoje") {
      if (!intraday) return null;
      const lastDay = new Date(intraday.candles[intraday.candles.length - 1].t * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const candles = intraday.candles.filter(
        (c) => new Date(c.t * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === lastDay,
      );
      return { candles, intraday: true, subtitle: `Pregão de ${lastDay}, candles de 5 minutos` };
    }
    if (!daily) return null;
    const days = PERIODS.find((p) => p.key === period)!.days;
    return { candles: daily.candles.slice(-days), intraday: false, subtitle: PERIODS.find((p) => p.key === period)!.label };
  }, [period, daily, intraday]);

  if (failed && !daily) return null;
  const first = view?.candles[0];
  const last = view?.candles[view.candles.length - 1];
  const change = first && last ? (last.c / (period === "hoje" ? first.o : first.c) - 1) * 100 : null;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Preço"
        subtitle={view?.subtitle ?? "Carregando..."}
        value={change == null ? undefined : <span className={change >= 0 ? "text-positive" : "text-negative"}>{fmtPct(change)}</span>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1 font-semibold ${period === p.key ? "bg-surface text-text ring-1 ring-border" : "text-muted hover:text-text"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMode(mode === "area" ? "candle" : "area")}
          className="rounded-lg border border-border px-3 py-1 font-semibold text-muted hover:text-text"
        >
          {mode === "area" ? "Ver candles" : "Ver linha"}
        </button>
        <Link href={`/trading?ticker=${ticker}&intervalo=${period === "hoje" ? "5m" : "1d"}`} className="ml-auto flex items-center gap-1.5 font-semibold text-muted hover:text-text">
          <ChartCandlestick size={16} /> Abrir no Trading
        </Link>
      </div>
      {view ? (
        <CandleChart candles={view.candles} intraday={view.intraday} mode={mode} lower="none" height={300} />
      ) : (
        <div className="h-[300px] animate-pulse rounded-lg bg-surface-2" />
      )}
      <p className="mt-2 text-xs text-muted">Com cerca de 15 minutos de atraso. Arraste o gráfico para ver mais.</p>
    </Card>
  );
}
