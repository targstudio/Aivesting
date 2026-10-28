import { Bell, ChevronDown, CircleHelp } from "lucide-react";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-[#2B57B0] px-4 text-white md:h-20 md:px-10">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-sm font-bold">
          AI
        </span>
        <span>
          AI<span className="font-light">.vesting</span>
        </span>
      </Link>
      <div className="flex items-center gap-4 md:gap-6">
        <button aria-label="Alertas" className="opacity-90 hover:opacity-100">
          <Bell size={22} />
        </button>
        <button aria-label="Ajuda" className="hidden opacity-90 hover:opacity-100 sm:block">
          <CircleHelp size={22} />
        </button>
        <div className="hidden h-10 w-px bg-white/30 sm:block" />
        <button className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white font-semibold text-[#2B57B0]">
            U
          </span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block font-medium">Investidor</span>
            <span className="block text-xs text-white/80">Plano gratuito</span>
          </span>
          <ChevronDown size={18} className="hidden md:block" />
        </button>
      </div>
    </header>
  );
}
