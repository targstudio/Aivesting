import { RadarScreen } from "@/app/components/trading/RadarScreen";
import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import type { RadarView } from "@/lib/trading";

export const metadata = { title: "Trading · Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ visao?: string; setup?: string }> }) {
  const { visao, setup } = await searchParams;
  const v = (["setups", "alta", "baixa", "day_trade"].includes(visao ?? "") ? visao : "setups") as RadarView;
  return (
    <>
      <Breadcrumbs items={[{ label: "Trading", href: "/trading" }, { label: "Radar" }]} />
      <PageTitle
        title="Radar de setups"
        subtitle="Varre as ações mais negociadas da B3 no gráfico diário e mostra quem deu setup hoje, além das melhores candidatas para day trade."
      />
      <RadarScreen view={v} setup={setup} />
    </>
  );
}
