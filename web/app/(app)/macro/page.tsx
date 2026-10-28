import { getMacro } from "@/lib/api";
import { changeColor, formatNumber } from "@/lib/format";
import { Breadcrumbs, Card, EmptyState, PageTitle, Stat } from "@/app/components/ui";

// O ranking muda durante o pregão: renderiza a cada acesso em vez de gerar a página no build.
export const dynamic = "force-dynamic";

export default async function MacroPage() {
  const macro = await getMacro();
  const indicators = macro?.indicators ?? [];
  return (
    <>
      <Breadcrumbs items={[{ label: "Macro" }]} />
      <PageTitle title="Cenário macroeconômico" subtitle="Indicadores do Banco Central usados pelo modelo e pelas explicações da IA." />
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
