import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { Simulator } from "./Simulator";

export default function SimulatorPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Simulador" }]} />
      <PageTitle
        eyebrow="Metas"
        title="Quanto você pode ter no futuro"
        subtitle="Diga a meta, quanto já tem e quanto consegue guardar por mês. O simulador repete o seu plano em todos os períodos desde 2000 e mostra o pior, o típico e o melhor caso em cinco carteiras."
      />
      <Simulator />
    </>
  );
}
