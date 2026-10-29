import Link from "next/link";
import { Logo, Wordmark } from "./Logo";

/** Moldura das páginas públicas de privacidade e termos (fora do app, sem exigir login). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-nav">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} variant="light" />
            <Wordmark className="text-sm text-white" />
          </Link>
          <Link href="/entrar" className="text-sm font-semibold text-primary hover:underline">
            Entrar
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Última atualização: {updated}</p>
        <div className="mt-8 space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
        <p className="mt-12 border-t border-border pt-6 text-sm text-muted">
          <Link href="/privacidade" className="hover:underline">
            Política de Privacidade
          </Link>{" "}
          ·{" "}
          <Link href="/termos" className="hover:underline">
            Termos de Uso
          </Link>
        </p>
      </main>
    </div>
  );
}

// E-mail público de contato, definido na Vercel (NEXT_PUBLIC_CONTACT_EMAIL).
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export function Contact() {
  return CONTACT ? (
    <a className="font-semibold underline" href={`mailto:${CONTACT}`}>
      {CONTACT}
    </a>
  ) : (
    <span className="font-semibold">o e-mail de contato do StockTower</span>
  );
}
