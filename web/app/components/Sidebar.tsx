"use client";

import { Bell, Bot, Building2, House, Landmark, LineChart, Settings, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: LucideIcon; soon?: boolean };

export const NAV_ITEMS: Item[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/ranking", label: "Ranking", icon: Trophy },
  { href: "/ranking?classe=fiis", label: "FIIs", icon: Building2 },
  { href: "/macro", label: "Macro", icon: Landmark },
  { href: "/mercado", label: "Mercado", icon: LineChart, soon: true },
  { href: "/assistente", label: "Assistente IA", icon: Bot },
  { href: "/alertas", label: "Alertas", icon: Bell, soon: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings, soon: true },
];

function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  return path === "/" ? pathname === "/" : pathname.startsWith(path) && !href.includes("?");
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <>
      <nav className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 flex-col gap-1 overflow-y-auto px-6 py-8 md:flex">
        {NAV_ITEMS.map(({ href, label, icon: Icon, soon }) =>
          soon ? (
            <span key={href} className="flex items-center gap-4 whitespace-nowrap rounded-full px-4 py-3 text-muted/70" title="Em breve">
              <Icon size={22} strokeWidth={1.5} className="shrink-0" />
              <span>{label}</span>
              <span className="ml-auto rounded-full bg-accent-bg px-2 py-0.5 text-[10px] font-semibold text-accent-text">breve</span>
            </span>
          ) : (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-4 rounded-full px-4 py-3 font-medium transition-colors ${
                isActive(pathname, href) ? "bg-primary text-on-primary" : "hover:bg-track"
              }`}
            >
              <Icon size={22} strokeWidth={1.5} className="shrink-0" />
              <span>{label}</span>
            </Link>
          ),
        )}
      </nav>
      {/* Mobile: barra inferior com os itens principais */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-surface py-2 md:hidden">
        {NAV_ITEMS.filter((i) => !i.soon && i.label !== "FIIs").map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 px-2 text-[11px] ${
              isActive(pathname, href) ? "font-semibold text-text" : "text-muted"
            }`}
          >
            <Icon size={20} strokeWidth={1.5} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
