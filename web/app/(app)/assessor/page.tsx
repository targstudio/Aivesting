import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { Advisor } from "./Advisor";

export default function AdvisorPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Assessor" }]} />
      <PageTitle
        eyebrow="Assessor IA"
        title="Onde colocar o seu dinheiro"
        subtitle="Responda 5 perguntas, diga quanto quer investir e receba um plano entre renda fixa, ações, FIIs e dólar, explicado pela IA."
      />
      <Advisor />
    </>
  );
}
