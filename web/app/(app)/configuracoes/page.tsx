import { AiUsageCard } from "@/app/components/AiUsageCard";
import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { Settings } from "./Settings";

export default function SettingsPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Configurações" }]} />
      <PageTitle title="Configurações" subtitle="Como a IA fala com você, alertas, o estado dos serviços e quanto a IA está consumindo." />
      <Settings />
      <div className="mt-6">
        <AiUsageCard />
      </div>
    </>
  );
}
