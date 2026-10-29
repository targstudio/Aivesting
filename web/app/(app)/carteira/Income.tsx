"use client";

import { useEffect, useState } from "react";
import { PairedBars } from "@/app/components/charts";
import { Card, CardHeader, MiniStat } from "@/app/components/ui";
import { apiFetch, type Holding, type PortfolioDividends } from "@/lib/api";
import { formatBRL, formatMonth, formatRatio } from "@/lib/format";

const shortMonth = (m: string) => formatMonth(m).split("/")[0];

/** Renda passiva da carteira: proventos dos últimos 12 meses por mês e a estimativa dos próximos 12. */
export function IncomeCard({ holdings }: { holdings: Holding[] }) {
  const [data, setData] = useState<PortfolioDividends | null>(null);
  const [error, setError] = useState("");
  const key = JSON.stringify(holdings.map((h) => [h.ticker, h.quantity]));

  useEffect(() => {
    let alive = true;
    apiFetch<PortfolioDividends>("/carteira/proventos", { method: "POST", body: JSON.stringify({ holdings }) })
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erro ao buscar os proventos."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) return null;
  if (!data) {
    return (
      <Card>
        <CardHeader title="Renda de proventos" subtitle="Buscando dividendos e rendimentos..." />
      </Card>
    );
  }
  const payers = data.assets.filter((a) => a.available && (a.income_12m ?? 0) > 0);
  const missingQty = holdings.filter((h) => (h.asset_class === "acoes" || h.asset_class === "fiis") && h.ticker && !h.quantity).length;
  const next = data.forecast.find((f) => f.value > 0);

  return (
    <Card>
      <CardHeader
        title="Renda de proventos"
        subtitle="Dividendos, JCP e rendimentos das suas ações e FIIs, pela data com"
        value={
          <>
            {formatBRL(data.monthly_avg)}
            <div className="text-xs font-normal text-muted">por mês, em média</div>
          </>
        }
      />
      {data.income_12m > 0 ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <MiniStat label="Últimos 12 meses" value={formatBRL(data.income_12m)} color="rgb(var(--chart-1))" />
            <MiniStat label="Próximos 12 meses (estimativa)" value={formatBRL(data.forecast.reduce((a, f) => a + f.value, 0))} color="rgb(var(--chart-4))" />
            {next && <MiniStat label={`Próximo mês com provento`} value={`${formatMonth(next.month)}: ${formatBRL(next.value)}`} color="rgb(var(--chart-3))" />}
          </div>
          <PairedBars
            suffix=""
            groups={data.received.map((r) => ({ label: shortMonth(r.month), values: [r.value] }))}
            series={[{ label: "Recebido em cada mês do último ano (R$)", color: "rgb(var(--chart-1))" }]}
          />
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Ativo</th>
                <th className="pb-2 text-right font-medium">DY 12m</th>
                <th className="pb-2 text-right font-medium">Recebido em 12 meses</th>
              </tr>
            </thead>
            <tbody>
              {payers.slice(0, 10).map((a) => (
                <tr key={a.ticker} className="border-t border-border">
                  <td className="py-2 font-semibold">{a.ticker}</td>
                  <td className="tabular py-2 text-right">{formatRatio(a.dy_12m, false)}</td>
                  <td className="tabular py-2 text-right">{formatBRL(a.income_12m ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-sm text-muted">Nenhum provento nos últimos 12 meses para as ações e FIIs da carteira.</p>
      )}
      <p className="mt-4 text-xs text-muted">
        {missingQty > 0 && `${missingQty} ativo(s) sem quantidade ficaram de fora. `}
        {data.disclaimer}
      </p>
    </Card>
  );
}
