"use client";

import { Bell, Sparkles } from "lucide-react";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { Logo } from "./Logo";

const LEVEL_LABELS = { iniciante: "IA: linguagem simples", intermediario: "IA: nível intermediário", avancado: "IA: nível avançado" };

export function Header() {
  const { prefs, unseen, askAI, ready } = useApp();
  const name = prefs.name.trim();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:h-20 md:px-10">
      <Link href="/" className="flex items-center gap-3">
        <Logo size={36} />
        <span className="text-lg font-bold tracking-tight">AI.vesting</span>
      </Link>
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={() => askAI()}
          className="hidden items-center gap-2 rounded-full bg-accent-bg px-5 py-2.5 text-sm font-semibold text-accent-text sm:flex"
        >
          <Sparkles size={18} /> Pergunte à IA
        </button>
        <Link href="/alertas" aria-label="Alertas" className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-track">
          <Bell size={20} />
          {unseen > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold text-white">
              {unseen}
            </span>
          )}
        </Link>
        <Link href="/configuracoes" className="flex items-center gap-3 rounded-full py-1 pl-1 pr-1 hover:bg-track md:pr-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
            {(name[0] ?? "U").toUpperCase()}
          </span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-semibold">{name || "Investidor"}</span>
            <span className="block text-xs text-muted">{ready ? LEVEL_LABELS[prefs.level] : "Plano gratuito"}</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
