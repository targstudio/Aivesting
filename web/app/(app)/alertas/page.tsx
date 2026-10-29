import { Breadcrumbs, InfoBanner, PageTitle } from "@/app/components/ui";
import { Alerts } from "./Alerts";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  return (
    <>
      <Breadcrumbs items={[{ label: "Alertas" }]} />
      <PageTitle
        title="Alertas"
        subtitle="Receba um aviso quando uma ação ou fundo chegar a um preço, subir ou cair muito no dia ou entrar entre os melhores. A IA explica cada alerta que disparar."
      />
      <InfoBanner>
        Os alertas ficam salvos neste navegador e são conferidos a cada poucos minutos enquanto o app está aberto. Alertas
        informam movimentos de dados; não são sinais de compra ou venda.
      </InfoBanner>
      <Alerts initialTicker={ticker?.toUpperCase()} />
    </>
  );
}
