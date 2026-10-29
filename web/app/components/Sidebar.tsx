"use client";

import { BookOpen, BriefcaseBusiness, Flag, LineChart, WalletCards, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Logo, Wordmark } from "./Logo";

type Tab = { href: string; label: string };
type Area = { href: string; label: string; short?: string; icon: LucideIcon; tabs?: Tab[]; extra?: string[] };

/**
 * O app em poucas áreas. Cada área junta as telas que respondem à mesma pergunta; as telas
 * de uma área aparecem como abas no topo (AreaTabs). Explorar guarda as listas para quem quer ir além.
 */
export const MARKET: Area = {
  href: "/mercado",
  label: "Mercado",
  icon: LineChart,
  tabs: [
    { href: "/mercado", label: "Visão geral" },
    { href: "/ranking", label: "Ações" },
    { href: "/ranking?classe=fiis", label: "Fundos imobiliários" },
    { href: "/renda-fixa", label: "Renda fixa" },
    { href: "/horizontes", label: "Longo prazo" },
    { href: "/comparar", label: "Comparar" },
    { href: "/macro", label: "Economia" },
  ],
  extra: ["/ativo", "/explorar"],
};

export const AREAS: Area[] = [
  { href: "/", label: "Jornada", icon: Flag },
  MARKET,
  {
    href: "/assessor",
    label: "Onde investir",
    short: "Investir",
    icon: BriefcaseBusiness,
    tabs: [
      { href: "/assessor", label: "Seu plano" },
      { href: "/simulador", label: "Quanto você vai ter" },
    ],
  },
  {
    href: "/carteira",
    label: "Minha carteira",
    short: "Carteira",
    icon: WalletCards,
    tabs: [
      { href: "/carteira", label: "Sua carteira" },
      { href: "/alertas", label: "Avisos" },
    ],
  },
  { href: "/enciclopedia", label: "Aprenda", icon: BookOpen },
];

const ALL_AREAS = AREAS;

const inPath = (pathname: string, href: string) => {
  const path = href.split("?")[0];
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
};

/** Abas que dividem a mesma tela pela query (Ações e Fundos imobiliários usam /ranking?classe=). */
const tabActive = (pathname: string, query: string, href: string) => {
  if (!inPath(pathname, href)) return false;
  const want = new URLSearchParams(href.split("?")[1] ?? "").get("classe");
  return want === new URLSearchParams(query).get("classe");
};

/** A área da tela atual: a que tem a tela entre as abas ou como endereço próprio. */
export function areaOf(pathname: string) {
  return ALL_AREAS.find(
    (a) => inPath(pathname, a.href) || a.tabs?.some((t) => inPath(pathname, t.href)) || a.extra?.some((e) => inPath(pathname, e)),
  );
}

/** Abas da área atual, no topo da tela. Some nas telas que não fazem parte de uma área com abas. */
export function AreaTabs() {
  return (
    <Suspense fallback={null}>
      <AreaTabsInner />
    </Suspense>
  );
}

function AreaTabsInner() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const area = areaOf(pathname);
  if (!area?.tabs || pathname.startsWith("/ativo")) return null;
  return (
    <nav aria-label={area.label} className="-mx-4 mb-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 text-sm">
        {area.tabs.map((t) => {
          const active = tabActive(pathname, query, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-4 py-2 font-semibold transition-colors ${
                active ? "bg-primary text-on-primary" : "text-muted hover:text-text"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NavLink({ area, active }: { area: Area; active: boolean }) {
  const Icon = area.icon;
  return (
    <Link
      href={area.href}
      className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
        active ? "bg-nav-2 text-white" : "text-nav-text hover:bg-nav-2/60 hover:text-white"
      }`}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-primary" aria-hidden />}
      <Icon size={18} strokeWidth={1.75} className={`shrink-0 ${active ? "text-primary" : ""}`} />
      <span>{area.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const current = areaOf(pathname);
  return (
    <>
      <div className="hidden w-60 shrink-0 bg-nav text-nav-text md:block">
        <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto px-4 py-6">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
            <Logo size={34} variant="light" />
            <Wordmark className="text-[15px] text-white" />
          </Link>
          <div className="flex flex-col gap-0.5">
            {AREAS.map((a) => (
              <NavLink key={a.href} area={a} active={current === a} />
            ))}
          </div>
        </aside>
      </div>
      {/* Mobile: barra inferior com as áreas */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around bg-nav py-2 md:hidden">
        {ALL_AREAS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className={`flex flex-col items-center gap-1 px-2 text-[11px] ${current === a ? "font-semibold text-primary" : "text-nav-muted"}`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {a.short ?? a.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
