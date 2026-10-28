import { Bell, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:h-20 md:px-10">
      <Link href="/" className="flex items-center gap-3">
        <Logo size={36} />
        <span className="text-lg font-bold tracking-tight">AI.vesting</span>
      </Link>
      <div className="flex items-center gap-2 md:gap-3">
        <button className="hidden items-center gap-2 rounded-full bg-accent-bg px-5 py-2.5 text-sm font-semibold text-accent-text sm:flex">
          <MessageSquare size={18} /> Ajuda
        </button>
        <button aria-label="Alertas" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-track">
          <Bell size={20} />
        </button>
        <button className="flex items-center gap-3 rounded-full py-1 pl-1 pr-1 hover:bg-track md:pr-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
            U
          </span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-semibold">Investidor</span>
            <span className="block text-xs text-muted">Plano gratuito</span>
          </span>
        </button>
      </div>
    </header>
  );
}
