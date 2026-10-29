import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { Advisor } from "./Advisor";

export default function AdvisorPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Onde investir" }]} />
      <PageTitle
        eyebrow="Assessor IA"
        title="Onde colocar o seu dinheiro"
        subtitle="Diga quanto quer investir e por quantos meses, responda 4 perguntas e receba um plano entre renda fixa, ações, FIIs e dólar, com sugestões para curto, médio e longo prazo."
      />
      <Advisor />
    </>
  );
}
