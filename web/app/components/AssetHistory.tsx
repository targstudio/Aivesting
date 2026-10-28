import type { AssetHistory, RiskMetrics } from "@/lib/api";
import { changeColor, formatMonth, formatProbability, formatRatio } from "@/lib/format";
import { PairedBars } from "./charts";
import { Card, Stat } from "./ui";

const plural = (y: string) => (y === "1" ? "1 ano" : `${y} anos`);

function RiskRow({ label, m }: { label: string; m: RiskMetrics | null }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2.5 pr-3 font-medium">{label}</td>
      <td className={`tabular py-2.5 pr-3 ${m ? changeColor(m.cagr) : ""}`}>{formatRatio(m?.cagr)}</td>
      <td className="tabular py-2.5 pr-3">{formatRatio(m?.volatility, false)}</td>
      <td className={`tabular py-2.5 pr-3 ${m && m.max_drawdown < 0 ? "text-negative" : ""}`}>
        {m && m.max_drawdown < 0 ? formatRatio(m.max_drawdown) : "–"}
      </td>
      {/* O Sharpe é medido contra o próprio CDI, então não faz sentido na linha do CDI. */}
      <td className="tabular py-2.5">{label === "CDI" ? "–" : (m?.sharpe?.toLocaleString("pt-BR") ?? "–")}</td>
    </tr>
  );
}

/** Dez anos de história do ativo: risco e retorno, ano a ano, crises e chances por horizonte. */
export function AssetHistorySection({ h }: { h: AssetHistory }) {
  const years = Object.keys(h.horizons).sort((a, b) => Number(a) - Number(b));
  const bench = new Map(h.benchmark_annual.map((a) => [a.year, a.return]));
  const cdi = new Map(h.cdi_annual.map((a) => [a.year, a.return]));
  const benchCrisis = new Map(h.benchmark_crises.map((c) => [c.key, c]));
  const crises = new Map(h.crises.map((c) => [c.key, c]));

  return (
    <div className="mt-6 flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 text-lg">Chances por horizonte</h2>
        <p className="mb-5 text-sm text-muted">
          Probabilidade estimada de superar o {h.benchmark} e o CDI. Onde o modelo não foi validado fora da amostra, o
          número é a frequência histórica da classe.
        </p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {years.map((y) => {
            const v = h.horizons[y];
            return (
              <div key={y}>
                {v ? (
                  <Stat
                    value={formatProbability(v.prob_beat_benchmark)}
                    label={`Em ${plural(y)}, vs ${h.benchmark}`}
                    accent
                    sub={
                      <>
                        {formatProbability(v.prob_beat_cdi)} vs CDI · {v.rank}º de {v.total}
                        {!h.model_used[y] && " · frequência histórica"}
                      </>
                    }
                  />
                ) : (
                  <Stat value="–" label={`Em ${plural(y)}`} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-lg">Risco e retorno em 10 anos</h2>
          <p className="mb-4 text-sm text-muted">Com proventos reinvestidos, até {formatMonth(h.data_through)}.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 pr-3 font-normal" />
                  <th className="pb-2 pr-3 font-normal">Retorno ao ano</th>
                  <th className="pb-2 pr-3 font-normal">Volatilidade</th>
                  <th className="pb-2 pr-3 font-normal">Pior queda</th>
                  <th className="pb-2 font-normal">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                <RiskRow label={h.ticker} m={h.risk_10y} />
                <RiskRow label={h.benchmark} m={h.benchmark_risk} />
                <RiskRow label="CDI" m={h.cdi_risk} />
              </tbody>
            </table>
          </div>
          {h.risk_10y && h.risk_10y.months < 120 && (
            <p className="mt-3 text-xs text-muted">O ativo tem só {Math.round(h.risk_10y.months / 12)} anos de histórico.</p>
          )}
          {h.in_scenario && (
            <p className="mt-4 text-sm">
              Em meses com cenário parecido com o atual ({h.scenario.label}), {h.ticker} rendeu em média{" "}
              <strong className={changeColor(h.in_scenario.avg_annual)}>{formatRatio(h.in_scenario.avg_annual)} ao ano</strong>
              {h.benchmark_in_scenario && (
                <>
                  , contra {formatRatio(h.benchmark_in_scenario.avg_annual)} do {h.benchmark}
                </>
              )}{" "}
              ({h.in_scenario.months} meses).
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg">Ano a ano</h2>
          <div className="mb-4">
            <PairedBars
              groups={h.annual.slice(-10).map((a) => ({
                label: `${String(a.year).slice(2)}`,
                values: [a.return * 100, bench.has(a.year) ? bench.get(a.year)! * 100 : null, cdi.has(a.year) ? cdi.get(a.year)! * 100 : null],
              }))}
              series={[
                { label: h.ticker, color: "rgb(var(--chart-1))" },
                { label: h.benchmark, color: "rgb(var(--chart-2))" },
                { label: "CDI", color: "rgb(var(--chart-4))" },
              ]}
            />
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 pr-3 font-normal">Ano</th>
                  <th className="pb-2 pr-3 font-normal">{h.ticker}</th>
                  <th className="pb-2 pr-3 font-normal">{h.benchmark}</th>
                  <th className="pb-2 font-normal">CDI</th>
                </tr>
              </thead>
              <tbody>
                {[...h.annual].reverse().map((a) => (
                  <tr key={a.year} className="border-t border-border">
                    <td className="py-2 pr-3">
                      {a.year}
                      {a.partial && <span className="text-xs text-muted"> (até agora)</span>}
                    </td>
                    <td className={`tabular py-2 pr-3 font-semibold ${changeColor(a.return)}`}>{formatRatio(a.return)}</td>
                    <td className="tabular py-2 pr-3">{formatRatio(bench.get(a.year))}</td>
                    <td className="tabular py-2">{formatRatio(cdi.get(a.year))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 text-lg">Como se comportou nas crises</h2>
        <p className="mb-4 text-sm text-muted">Do pico antes da crise até o fundo, e quanto tempo levou para voltar ao nível anterior.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 pr-3 font-normal">Crise</th>
                <th className="pb-2 pr-3 font-normal">{h.ticker}</th>
                <th className="pb-2 pr-3 font-normal">{h.benchmark}</th>
                <th className="pb-2 font-normal">Recuperação</th>
              </tr>
            </thead>
            <tbody>
              {h.crisis_list.map((c) => {
                const r = crises.get(c.key);
                const b = benchCrisis.get(c.key);
                return (
                  <tr key={c.key} className="border-t border-border align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted">
                        {formatMonth(c.start)} a {formatMonth(c.end)} · {c.description}
                      </div>
                    </td>
                    <td className={`tabular py-2.5 pr-3 font-semibold ${r?.return != null ? changeColor(r.return) : "text-muted"}`}>
                      {r?.return != null ? formatRatio(r.return) : "não negociava"}
                    </td>
                    <td className="tabular py-2.5 pr-3">{formatRatio(b?.return)}</td>
                    <td className="py-2.5 text-muted">
                      {r?.return == null
                        ? "–"
                        : r.return >= 0
                          ? "não caiu"
                          : r.recovery_months != null
                            ? `${r.recovery_months} ${r.recovery_months === 1 ? "mês" : "meses"}`
                            : "ainda não voltou"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
