import { StrategyLab } from "@/app/components/trading/StrategyLab";
import { Breadcrumbs, InfoBanner, PageTitle } from "@/app/components/ui";

export const metadata = { title: "Trading · Testar estratégia" };

export default async function StrategiesPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  return (
    <>
      <Breadcrumbs items={[{ label: "Trading", href: "/trading" }, { label: "Testar estratégia" }]} />
      <PageTitle
        title="Testar estratégia"
        subtitle="Escreva a estratégia em português ou escolha uma pronta. O teste usa o histórico do ativo com custos da B3, lote de 100, execução no candle seguinte e imposto."
      />
      <InfoBanner>
        Um bom resultado no passado não garante o futuro. Desconfie de estratégias com poucas operações ou ajustadas
        demais a um único ativo, e teste em vários ativos e períodos antes de usar dinheiro de verdade.
      </InfoBanner>
      <StrategyLab initialTicker={(ticker ?? "PETR4").toUpperCase().slice(0, 8)} />
    </>
  );
}
