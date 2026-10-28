import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { Portfolio } from "./Portfolio";

export default function PortfolioPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Minha carteira" }]} />
      <PageTitle
        eyebrow="Inteligência"
        title="Minha carteira"
        subtitle="Mande prints da sua corretora e a IA monta a carteira: divisão por classe e setor, concentração, como ela teria ido nos últimos 10 anos e nas crises, e a comparação com o plano do assessor."
      />
      <Portfolio />
    </>
  );
}
