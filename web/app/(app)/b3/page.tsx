import { AllAssets } from "./AllAssets";
import { Breadcrumbs, InfoBanner, PageTitle } from "@/app/components/ui";

export default async function B3Page({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const { q, tipo } = await searchParams;
  return (
    <>
      <Breadcrumbs items={[{ label: "Todas da B3" }]} />
      <PageTitle
        title="Todas as ações da B3"
        subtitle="Ações, FIIs, ETFs, BDRs e units negociados na bolsa. Busque pelo código ou pelo nome da empresa e abra qualquer ativo para ver a cotação."
      />
      <InfoBanner>
        A lista e o fechamento vêm do arquivo público de cotações da B3, do último pregão. Ao abrir um ativo, a cotação é
        buscada na hora, com cerca de 15 minutos de atraso. O ranking de 5 minutos cobre só os ativos mais líquidos.
      </InfoBanner>
      <AllAssets initialQuery={q ?? ""} initialType={tipo ?? ""} />
    </>
  );
}
