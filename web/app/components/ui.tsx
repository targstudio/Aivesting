import { ChevronRight, House, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <Link href="/" className="flex items-center gap-1 hover:underline">
        <House size={16} /> Início
      </Link>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <ChevronRight size={14} className="text-muted" />
          {item.href ? (
            <Link href={item.href} className="hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-muted">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-normal md:text-[28px]">{title}</h1>
      {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded border border-primary/30 bg-info-bg px-5 py-4 text-sm">
      <Info size={18} className="mt-0.5 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded border border-border bg-surface p-5 md:p-6 ${className}`}>{children}</section>;
}

export function Stat({ value, label, accent = false, sub }: { value: string; label: string; accent?: boolean; sub?: ReactNode }) {
  return (
    <div>
      <div className={`tabular text-2xl md:text-[28px] ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="mt-1 text-sm">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card className="text-sm text-muted">{children}</Card>;
}
