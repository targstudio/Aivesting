import type { Scenario } from "@/lib/api";
import { formatNumber, formatRatio } from "@/lib/format";
import { Card } from "./ui";

/** Cenário macro atual (Brasil e mundo) usado pelo modelo de horizontes. */
export function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const items = Object.entries(scenario.indicators);
  return (
    <Card>
      <h2 className="mb-1 text-lg">Cenário atual</h2>
      <p className="mb-4 text-sm text-muted">
        {scenario.label ? `${scenario.label}.` : "Cenário indefinido."}
        {scenario.similar_months != null && ` ${scenario.similar_months} meses desde 2000 tiveram esse mesmo cenário.`}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map(([key, i]) => (
          <div key={key}>
            <div className="tabular text-lg font-bold">
              {i.unit === "R$" ? "R$ " : ""}
              {formatNumber(i.value)}
              {i.unit.startsWith("%") ? "%" : ""}
            </div>
            <div className="text-xs">{i.label}</div>
            <div className="text-xs text-muted">
              {i.change_12m != null && `${i.change_12m > 0 ? "+" : ""}${formatNumber(i.change_12m)} p.p. em 12 meses`}
              {i.return_12m != null && `${formatRatio(i.return_12m)} em 12 meses`}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
