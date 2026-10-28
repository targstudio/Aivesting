import { InfoBanner, PageTitle } from "@/app/components/ui";
import { Chat } from "./Chat";

export default function AssistantPage() {
  return (
    <>
      <PageTitle
        eyebrow="Assistente IA"
        title="Pergunte à Claude sobre o mercado"
        subtitle="Ela consulta o ranking, os ativos e os dados macro do app antes de responder."
      />
      <InfoBanner>A assistente apresenta e explica dados; ela não recomenda compra ou venda de ativos.</InfoBanner>
      <Chat />
    </>
  );
}
