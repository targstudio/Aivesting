import { InfoBanner, PageTitle } from "@/app/components/ui";
import { Chat } from "./Chat";

export default function AssistantPage() {
  return (
    <>
      <PageTitle
        eyebrow="Assistente IA"
        title="Pergunte à Claude sobre o mercado"
        subtitle="Pergunte do seu jeito. Ela consulta os dados do app e responde em palavras simples."
      />
      <InfoBanner>A assistente explica os dados; ela não manda comprar nem vender.</InfoBanner>
      <Chat />
    </>
  );
}
