import { Breadcrumbs, InfoBanner, PageTitle } from "@/app/components/ui";
import { Alerts } from "./Alerts";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  return (
    <>
      <Breadcrumbs items={[{ label: "Alertas" }]} />
      <PageTitle
        title="Alertas"
        subtitle="Avise-me quando um ativo atingir um preço, variar forte no dia ou subir no ranking. A IA explica cada alerta que disparar."
      />
      <InfoBanner>
        Os alertas ficam salvos neste navegador e são conferidos a cada poucos minutos enquanto o app está aberto. Alertas
        informam movimentos de dados; não são sinais de compra ou venda.
      </InfoBanner>
      <Alerts initialTicker={ticker?.toUpperCase()} />
    </>
  );
}
