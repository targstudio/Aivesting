import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { getFixedIncomeRates } from "@/lib/api";
import { FixedIncome } from "./FixedIncome";

export const dynamic = "force-dynamic";

export default async function FixedIncomePage() {
  const rates = await getFixedIncomeRates();
  return (
    <>
      <Breadcrumbs items={[{ label: "Renda fixa" }]} />
      <PageTitle
        eyebrow="Renda fixa"
        title="Quanto rende cada aplicação"
        subtitle="Compare poupança, CDB, LCI/LCA e Tesouro Direto já descontando imposto e taxas, para o seu valor e o seu prazo."
      />
      <FixedIncome rates={rates} />
    </>
  );
}
