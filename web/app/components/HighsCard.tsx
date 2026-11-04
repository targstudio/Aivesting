import type { AssetHighs, HighMove } from "@/lib/api";
import { changeColor, formatMonth, formatRatio } from "@/lib/format";
import { Term } from "./Term";
import { Card } from "./ui";

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
const month = (iso: string) => formatMonth(iso.slice(0, 7));
const span = (m: HighMove) => (m.start.slice(0, 7) === m.end.slice(0, 7) ? month(m.end) : `${month(m.start)} a ${month(m.end)}`);

function Highlight({ label, value, sub }: { label: React.ReactNode; value: number | null | undefined; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border px-3 py-3 md:px-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-1 text-lg font-bold md:text-xl ${value != null ? changeColor(value) : "text-muted"}`}>{formatRatio(value)}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Maiores altas de qualquer ativo: quanto subiu em cada prazo e os melhores momentos dos últimos 10 anos. */
export function HighsCard({ h }: { h: AssetHighs }) {
  const years = Math.round(h.months / 12);
  const high = h.high_12m;
  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-lg">Maiores altas</h2>
      <p className="mb-4 text-sm text-muted">
        Quanto {h.ticker} subiu ou caiu em cada prazo, contando os dividendos, até {day(h.as_of)}.
      </p>

      <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {h.periods.map((p) => (
          <div key={p.key} className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="text-xs text-muted">{p.label}</div>
            <div className={`tabular text-sm font-bold ${changeColor(p.change)}`}>{formatRatio(p.change)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Highlight label="Melhor dia nos últimos 12 meses" value={h.best_day?.change} sub={h.best_day ? day(h.best_day.end) : undefined} />
        <Highlight
          label={years >= 2 ? `Melhor mês em ${years} anos` : "Melhor mês"}
          value={h.best_month?.change}
          sub={h.best_month ? month(h.best_month.end) : undefined}
        />
        <Highlight label={<Term k="maior_alta" />} value={h.best_12m?.change} sub={h.best_12m ? span(h.best_12m) : "precisa de mais de 1 ano de história"} />
        <Highlight
          label={<Term k="maior_subida">Maior subida, do fundo ao topo</Term>}
          value={h.max_rally?.change}
          sub={h.max_rally ? span(h.max_rally) : undefined}
        />
        <Highlight label={<Term k="pior_queda" />} value={h.max_drawdown?.change} sub={h.max_drawdown ? span(h.max_drawdown) : undefined} />
        <div className="rounded-2xl border border-border px-3 py-3 md:px-4">
          <div className="text-xs text-muted">Perto do maior preço do ano?</div>
          {high ? (
            <>
              <div className="mt-1 text-lg font-bold md:text-xl">
                {high.below > -0.005 ? "No topo do ano" : <span className="tabular text-negative">{formatRatio(high.below)}</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {high.below > -0.005 ? `maior preço em ${day(high.date)}` : `abaixo do maior preço, de ${day(high.date)}`}
              </div>
            </>
          ) : (
            <div className="mt-1 text-xl font-bold text-muted">–</div>
          )}
        </div>
      </div>

      {h.up_month_share != null && h.months >= 12 && (
        <p className="mt-4 text-sm">
          Em {years >= 1 ? `${years} ${years === 1 ? "ano" : "anos"}` : `${h.months} meses`}, {h.ticker} subiu em{" "}
          <strong>{Math.round(h.up_month_share * 10)} de cada 10 meses</strong>. Altas fortes costumam vir junto com quedas
          fortes: o que subiu muito também pode cair.
        </p>
      )}
      <p className="mt-3 text-xs text-muted">{h.disclaimer}</p>
    </Card>
  );
}
