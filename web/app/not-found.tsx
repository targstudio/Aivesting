import Link from "next/link";
import { PageTitle } from "./components/ui";

export default function NotFound() {
  return (
    <>
      <PageTitle title="Página não encontrada" subtitle="O ativo ou a página que você procurou não existe ou ainda não está no ranking." />
      <Link href="/" className="text-primary hover:underline">
        Voltar ao início
      </Link>
    </>
  );
}
