import { Breadcrumbs, PageTitle } from "@/app/components/ui";
import { Settings } from "./Settings";

export default function SettingsPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Configurações" }]} />
      <PageTitle title="Configurações" subtitle="Como a IA fala com você, alertas e o estado dos serviços do app." />
      <Settings />
    </>
  );
}
