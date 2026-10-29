import Link from "next/link";
import { PageTitle } from "./components/ui";

export default function NotFound() {
  return (
    <>
      <PageTitle title="Página não encontrada" subtitle="O investimento ou a página que você procurou não existe ou ainda não está na lista." />
      <Link href="/" className="inline-flex rounded-full bg-primary px-6 py-3 font-semibold text-on-primary">
        Voltar ao início
      </Link>
    </>
  );
}
