import { Journal } from "@/app/components/trading/Journal";
import { Breadcrumbs, PageTitle } from "@/app/components/ui";

export const metadata = { title: "Trading · Diário" };

export default function JournalPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Trading", href: "/trading" }, { label: "Diário de trades" }]} />
      <PageTitle
        title="Diário de trades"
        subtitle="Registre suas operações (ou importe o print da nota de corretagem) e veja taxa de acerto, payoff, os setups que dão lucro e o imposto do mês com o DARF."
      />
      <Journal />
    </>
  );
}
