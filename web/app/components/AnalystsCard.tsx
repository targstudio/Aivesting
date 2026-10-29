import type { AnalystSide, AssetAnalysts } from "@/lib/api";
import { formatBRL, formatRatio } from "@/lib/format";
import { Card, CardHeader, Stat } from "./ui";

const SIDES: { key: AnalystSide; label: string; color: string; badge: string }[] = [
  { key: "compra", label: "Compra", color: "rgb(var(--positive))", badge: "bg-positive/10 text-positive" },
  { key: "neutro", label: "Neutro", color: "rgb(var(--chart-4))", badge: "bg-border/60 text-muted" },
  { key: "venda", label: "Venda", color: "rgb(var(--negative))", badge: "bg-negative/10 text-negative" },
];
const SIDE = Object.fromEntries(SIDES.map((s) => [s.key, s]));

const dateBR = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

/** O que bancos e corretoras dizem do ativo: placar compra/neutro/venda, preço-alvo médio e as casas com nome. */
export function AnalystsCard({ a, ticker }: { a: AssetAnalysts | null; ticker: string }) {
  const title = "O que dizem bancos e corretoras";
  const subtitle = "Analistas que acompanham a empresa e dizem se acham que vale comprar, manter ou vender";
  if (!a) {
    return (
      <Card className="mb-6">
        <CardHeader title={title} subtitle={subtitle} />
        <p className="text-sm text-muted">
          Não achamos opiniões de analistas publicadas de graça para {ticker}. Isso é comum em empresas menores e em
          fundos imobiliários, que poucos bancos acompanham.
        </p>
      </Card>
    );
  }
  const c = a.counts;
  const top = c ? SIDES.reduce((best, s) => (c[s.key] > c[best.key] ? s : best), SIDES[0]) : null;
  return (
    <Card className="mb-6">
      <CardHeader title={title} subtitle={subtitle} />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-5">
          {c && top && (
            <div>
              <p className="mb-3 text-sm">
                De <strong>{c.total}</strong> {c.total === 1 ? "analista" : "analistas"}, a opinião mais comum é{" "}
                <strong style={{ color: top.color }}>{top.label.toLowerCase()}</strong>.
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-border">
                {SIDES.map((s) =>
                  c[s.key] ? <span key={s.key} style={{ width: `${(100 * c[s.key]) / c.total}%`, background: s.color }} /> : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {SIDES.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    {s.label}: <strong className="tabular">{c[s.key]}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
          {a.target_mean != null && (
            <div className="grid grid-cols-2 gap-6">
              <Stat
                value={formatBRL(a.target_mean)}
                label="Preço que esperam, em média"
                accent
                sub={a.target_low != null && a.target_high != null ? `de ${formatBRL(a.target_low)} a ${formatBRL(a.target_high)}` : undefined}
              />
              {a.upside != null && (
                <Stat value={formatRatio(a.upside)} label="Diferença para o preço de hoje" sub="em cerca de 12 meses, se acertarem" />
              )}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Quem disse o quê</h3>
          {a.firms.length ? (
            <table className="w-full text-sm">
              <tbody>
                {a.firms.slice(0, 12).map((f) => (
                  <tr key={f.firm} className="border-t border-border first:border-t-0">
                    <td className="py-2">
                      <div className="font-medium">{f.firm}</div>
                      <div className="text-xs text-muted">
                        {dateBR(f.date)}
                        {f.previous_side && f.previous_side !== f.side ? ` · antes: ${f.previous_side}` : ""}
                        {f.source.startsWith("ADR") ? ` · sobre a ${f.source.slice(4)}, ação da empresa em Nova York` : ""}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SIDE[f.side].badge}`}>{SIDE[f.side].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">
              A fonte gratuita mostra só a contagem, sem dizer qual banco ou corretora deu cada opinião.
            </p>
          )}
          {a.firms.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Só aparecem as casas que mudaram ou publicaram a recomendação nos últimos 18 meses e que a fonte gratuita
              identifica pelo nome. A contagem ao lado inclui casas que não aparecem aqui.
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        {a.disclaimer} Fonte: {a.source}, consultado em {dateBR(a.as_of)}.
      </p>
    </Card>
  );
}
