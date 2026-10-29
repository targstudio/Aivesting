"use client";

import {
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Columns3,
  Hourglass,
  House,
  Landmark,
  PiggyBank,
  LineChart,
  Settings,
  Trophy,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Logo, Wordmark } from "./Logo";

type Item = { href: string; label: string; icon: LucideIcon; mobile?: boolean; short?: string };

/** Menu dividido em seções, como no painel de referência. */
export const NAV_SECTIONS: { title?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/", label: "Início", icon: House, mobile: true },
      { href: "/mercado", label: "Mercado", icon: LineChart },
      { href: "/ranking", label: "Melhores ações", short: "Melhores", icon: Trophy, mobile: true },
      { href: "/ranking?classe=fiis", label: "Fundos imobiliários", icon: Building2 },
      { href: "/horizontes", label: "Longo prazo", icon: Hourglass },
      { href: "/comparar", label: "Comparar", icon: Columns3 },
      { href: "/renda-fixa", label: "Renda fixa", icon: PiggyBank },
      { href: "/macro", label: "Economia", icon: Landmark },
    ],
  },
  {
    title: "Para você",
    items: [
      { href: "/carteira", label: "Minha carteira", short: "Carteira", icon: WalletCards, mobile: true },
      {
        href: "/assessor",
        label: "Onde investir",
        icon: BriefcaseBusiness,
        mobile: true,
      },
      { href: "/simulador", label: "Simulador de metas", short: "Simulador", icon: Calculator },
      { href: "/assistente", label: "Pergunte à IA", short: "IA", icon: Bot },
      { href: "/enciclopedia", label: "Aprenda o básico", short: "Aprenda", icon: BookOpen },
    ],
  },
  {
    title: "Outros",
    items: [
      { href: "/alertas", label: "Alertas", icon: Bell, mobile: true },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** Compara caminho e query: "Ranking" e "FIIs" usam a mesma página, separadas por ?classe=fiis. */
function isActive(pathname: string, query: string, href: string) {
  const [path, hrefQuery = ""] = href.split("?");
  if (path === "/") return pathname === "/";
  if (!pathname.startsWith(path)) return false;
  const want = new URLSearchParams(hrefQuery).get("classe");
  const have = new URLSearchParams(query).get("classe");
  return path === "/ranking" ? (want ?? "acoes") === (have ?? "acoes") : true;
}

function useQuery() {
  return useSearchParams().toString();
}

/** useSearchParams precisa de Suspense; sem ela, as páginas estáticas não compilam. */
function WithQuery({
  children,
}: {
  children: (query: string) => React.ReactNode;
}) {
  return (
    <Suspense fallback={children("")}>
      <QueryReader>{children}</QueryReader>
    </Suspense>
  );
}

function QueryReader({
  children,
}: {
  children: (query: string) => React.ReactNode;
}) {
  return <>{children(useQuery())}</>;
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <>
      <div className="hidden w-60 shrink-0 bg-nav text-nav-text md:block">
        <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto px-4 py-6">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
            <Logo size={34} variant="light" />
            <Wordmark className="text-[15px] text-white" />
          </Link>
          <WithQuery>
            {(query) =>
              NAV_SECTIONS.map((section, i) => (
                <div
                  key={section.title ?? i}
                  className={i > 0 ? "mt-5 border-t border-white/10 pt-5" : ""}
                >
                  {section.title && (
                    <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-nav-muted">
                      {section.title}
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {section.items.map(({ href, label, icon: Icon }) => {
                      const active = isActive(pathname, query, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                            active
                              ? "bg-nav-2 text-white"
                              : "text-nav-text hover:bg-nav-2/60 hover:text-white"
                          }`}
                        >
                          {active && (
                            <span
                              className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-primary"
                              aria-hidden
                            />
                          )}
                          <Icon
                            size={18}
                            strokeWidth={1.75}
                            className={`shrink-0 ${active ? "text-primary" : ""}`}
                          />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))
            }
          </WithQuery>
        </aside>
      </div>
      {/* Mobile: barra inferior com os itens principais */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around bg-nav py-2 md:hidden">
        <WithQuery>
          {(query) =>
            NAV_ITEMS.filter((i) => i.mobile).map(
              ({ href, label, short, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-1 px-2 text-[11px] ${isActive(pathname, query, href) ? "font-semibold text-primary" : "text-nav-muted"}`}
                >
                  <Icon size={20} strokeWidth={1.75} />
                  {short ?? label}
                </Link>
              ),
            )
          }
        </WithQuery>
      </nav>
    </>
  );
}
