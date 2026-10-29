import { getMacro } from "@/lib/api";
import { changeColor, formatNumber } from "@/lib/format";
import { AiInsight } from "@/app/components/AiInsight";
import { Breadcrumbs, Card, EmptyState, PageTitle, Stat } from "@/app/components/ui";

// O ranking muda durante o pregão: renderiza a cada acesso em vez de gerar a página no build.
export const dynamic = "force-dynamic";

export default async function MacroPage() {
  const macro = await getMacro();
  const indicators = macro?.indicators ?? [];
  return (
    <>
      <Breadcrumbs items={[{ label: "Economia" }]} />
      <PageTitle title="Como está a economia" subtitle="Juros, inflação e dólar segundo o Banco Central. Eles mexem com quanto rendem os seus investimentos." />
      <AiInsight context="macro" title="O cenário explicado pela IA" askPrompt="Como os juros e a inflação de hoje afetam quem quer investir?" />
      {indicators.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {indicators.map((m) => {
            const delta = m.previous != null ? m.value - m.previous : null;
            return (
              <Card key={m.key}>
                <Stat
                  value={`${m.unit === "R$" ? "R$ " : ""}${formatNumber(m.value)}${m.unit.startsWith("%") ? "%" : ""}`}
                  label={m.label}
                  accent
                  sub={
                    <>
                      em {m.date}
                      {delta != null && (
                        <span className={`ml-2 ${changeColor(delta)}`}>
                          ({delta > 0 ? "+" : ""}
                          {formatNumber(delta)} vs. anterior)
                        </span>
                      )}
                    </>
                  }
                />
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState>Não foi possível carregar os dados do Banco Central.</EmptyState>
      )}
    </>
  );
}
