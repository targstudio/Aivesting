import type { AssetDividends } from "@/lib/api";
import { formatBRL, formatMonth, formatRatio } from "@/lib/format";
import { Card, CardHeader, Stat } from "./ui";

const FREQUENCY_TEXT: Record<string, string> = {
  mensal: "Paga todo mês",
  trimestral: "Paga a cada poucos meses",
  "semestral ou anual": "Paga uma ou duas vezes por ano",
};

/** Proventos do ativo: dividend yield de 12 meses, frequência e os últimos pagamentos (pela data com). */
export function DividendsCard({ d }: { d: AssetDividends }) {
  const recent = [...d.payments].reverse().slice(0, 8);
  const perThousand = d.dy_12m != null ? 1000 * d.dy_12m : null;
  return (
    <Card className="mb-6">
      <CardHeader title="Proventos" subtitle="Dividendos, JCP e rendimentos pagos por ação ou cota" />
      {d.total_12m > 0 ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="grid grid-cols-2 gap-6">
            <Stat value={formatRatio(d.dy_12m, false)} label="Dividend yield 12 meses" accent sub="proventos do último ano ÷ preço" />
            <Stat value={formatBRL(d.total_12m)} label="Por ação ou cota em 12 meses" sub={d.frequency ? FREQUENCY_TEXT[d.frequency] : undefined} />
            {perThousand != null && (
              <p className="col-span-2 rounded-xl bg-accent-bg/60 px-4 py-3 text-sm text-accent-text">
                Com o mesmo pagamento do último ano, R$ 1.000 aplicados hoje renderiam cerca de{" "}
                <strong>{formatBRL(perThousand)}</strong> por ano ({formatBRL(perThousand / 12)} por mês), fora a variação do preço.
              </p>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Data com</th>
                <th className="pb-2 text-right font-medium">Valor por ação ou cota</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="py-2">
                    {new Date(`${p.date}T12:00:00`).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="tabular py-2 text-right">{formatBRL(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Sem proventos nos últimos 12 meses
          {d.payments.length ? ` (o último foi em ${formatMonth(d.payments[d.payments.length - 1].date.slice(0, 7))})` : ""}.
        </p>
      )}
      <p className="mt-4 text-xs text-muted">{d.disclaimer}</p>
    </Card>
  );
}
