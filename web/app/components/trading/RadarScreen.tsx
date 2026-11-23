"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Sparkline } from "@/app/components/Sparkline";
import { Card } from "@/app/components/ui";
import { apiFetch } from "@/lib/api";
import { fmtBig, fmtMoney, fmtNum, fmtPct, type Radar, type RadarView } from "@/lib/trading";
import { PhaseBadge, SetupBadge } from "./parts";

const VIEWS: { key: RadarView; label: string }[] = [
  { key: "setups", label: "Todos os setups" },
  { key: "alta", label: "Setups de alta" },
  { key: "baixa", label: "Setups de baixa" },
  { key: "day_trade", label: "Para day trade" },
];

export function RadarScreen({ view, setup }: { view: RadarView; setup?: string }) {
  const [data, setData] = useState<Radar | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    const qs = new URLSearchParams({ visao: view, ...(setup ? { setup } : {}) });
    apiFetch<Radar>(`/trading/radar?${qs}`)
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar o radar."));
  }, [view, setup]);

  const dayTrade = view === "day_trade";
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 text-sm">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/trading/radar?visao=${v.key}`}
              className={`whitespace-nowrap rounded-lg px-4 py-2 font-semibold ${view === v.key && !setup ? "bg-surface-2 text-text ring-1 ring-border" : "text-muted hover:text-text"}`}
            >
              {v.label}
            </Link>
          ))}
        </div>
        {data && <PhaseBadge phase={data.pregao} />}
      </div>

      {data && !dayTrade && data.contagem_setups.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.contagem_setups.map((s) => (
            <Link
              key={s.key}
              href={`/trading/radar?visao=setups&setup=${s.key}`}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${setup === s.key ? "border-text" : "border-border"} bg-surface hover:border-text`}
            >
              <span className={s.direction === "alta" ? "text-positive" : s.direction === "baixa" ? "text-negative" : "text-muted"}>●</span>{" "}
              {s.label} <span className="text-muted">({s.total})</span>
            </Link>
          ))}
        </div>
      )}

      {error && <Card className="text-sm text-negative">{error}</Card>}
      {!error && !data && <Card className="h-96 animate-pulse bg-surface-2">{null}</Card>}
      {data && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Ativo</th>
                <th className="px-3 py-3 text-right font-medium">Preço</th>
                <th className="px-3 py-3 text-right font-medium">Dia</th>
                <th className="px-3 py-3 font-medium">30 dias</th>
                <th className="px-3 py-3 font-medium">Tendência</th>
                <th className="px-3 py-3 text-right font-medium">IFR 14</th>
                <th className="px-3 py-3 text-right font-medium">{dayTrade ? "Amplitude (ATR)" : "Vol. relativo"}</th>
                <th className="px-3 py-3 text-right font-medium">{dayTrade ? "Gap" : "Giro/dia"}</th>
                <th className="px-4 py-3 font-medium">{dayTrade ? "Giro/dia" : "Setups"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.ativos.map((r) => (
                <tr key={r.ticker} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/trading?ticker=${r.ticker}&intervalo=${dayTrade ? "5m" : "1d"}`} className="flex items-center gap-2.5">
                      <AssetLogo ticker={r.ticker} size={28} />
                      <span>
                        <span className="block font-bold">{r.ticker}</span>
                        <span className="block max-w-[160px] truncate text-xs text-muted">{r.name}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{fmtMoney(r.price)}</td>
                  <td className={`tabular px-3 py-3 text-right font-semibold ${(r.change_percent ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                    {fmtPct(r.change_percent)}
                  </td>
                  <td className="px-3 py-3">
                    <Sparkline values={r.spark} />
                  </td>
                  <td className="px-3 py-3">{r.trend}</td>
                  <td className="tabular px-3 py-3 text-right">{fmtNum(r.ifr14, 0)}</td>
                  <td className="tabular px-3 py-3 text-right">
                    {dayTrade ? `${fmtNum(r.atr_pct)}%` : r.volume_relativo != null ? `${fmtNum(r.volume_relativo, 1)}x` : "–"}
                  </td>
                  <td className="tabular px-3 py-3 text-right">{dayTrade ? fmtPct(r.gap_pct) : fmtBig(r.volume_financeiro)}</td>
                  <td className="px-4 py-3">
                    {dayTrade ? (
                      <span className="tabular">{fmtBig(r.volume_financeiro)}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.setups.map((s) => (
                          <SetupBadge key={s.key} setup={s} />
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.ativos.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    Nenhum ativo apareceu nesta lista hoje.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      {data && (
        <p className="mt-3 text-xs text-muted">
          {data.varridos} ações varridas · {data.fonte} {dayTrade && "Só entram ações com giro acima de R$ 20 mi por dia. "}
          {data.aviso}
        </p>
      )}
    </>
  );
}
