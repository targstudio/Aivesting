"use client";

import { Bell, BookOpen, Bot, BriefcaseBusiness, Building2, Hourglass, House, Landmark, LineChart, Settings, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

type Item = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

/** Menu dividido em seções, como no painel de referência. */
export const NAV_SECTIONS: { title?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/", label: "Início", icon: House, mobile: true },
      { href: "/mercado", label: "Mercado", icon: LineChart, mobile: true },
      { href: "/ranking", label: "Ranking", icon: Trophy, mobile: true },
      { href: "/ranking?classe=fiis", label: "FIIs", icon: Building2 },
      { href: "/horizontes", label: "Horizontes", icon: Hourglass },
      { href: "/macro", label: "Macro", icon: Landmark },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { href: "/assessor", label: "Assessor", icon: BriefcaseBusiness, mobile: true },
      { href: "/assistente", label: "Assistente IA", icon: Bot },
      { href: "/enciclopedia", label: "Enciclopédia", icon: BookOpen },
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

function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  return path === "/" ? pathname === "/" : pathname.startsWith(path) && !href.includes("?");
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <>
      <div className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
      <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto px-4 py-6">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
          <Logo size={30} />
          <span className="text-lg font-bold tracking-tight">AI.vesting</span>
        </Link>
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title ?? i} className={i > 0 ? "mt-5 border-t border-border pt-5" : ""}>
            {section.title && <div className="mb-2 px-3 text-xs font-medium text-muted">{section.title}</div>}
            <div className="flex flex-col gap-1">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "bg-surface-2 text-text ring-1 ring-border" : "text-muted hover:bg-surface-2/60 hover:text-text"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </aside>
      </div>
      {/* Mobile: barra inferior com os itens principais */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-surface/95 py-2 backdrop-blur md:hidden">
        {NAV_ITEMS.filter((i) => i.mobile).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 px-2 text-[11px] ${isActive(pathname, href) ? "font-semibold text-accent-text" : "text-muted"}`}
          >
            <Icon size={20} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
