import { ChevronRight, House, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <Link href="/" className="flex items-center gap-1 font-medium hover:underline">
        <House size={16} /> Início
      </Link>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <ChevronRight size={14} className="text-muted" />
          {item.href ? (
            <Link href={item.href} className="font-medium hover:underline">
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

export function PageTitle({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="mb-1 text-muted">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight md:text-[32px] md:leading-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-accent-bg px-5 py-4 text-sm text-accent-text">
      <Info size={18} className="mt-0.5 shrink-0" />
      <div className="font-medium">{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-border bg-surface p-6 md:p-8 ${className}`}>{children}</section>;
}

export function Stat({ value, label, accent = false, sub }: { value: string; label: string; accent?: boolean; sub?: ReactNode }) {
  return (
    <div>
      <div className={`tabular text-2xl font-bold tracking-tight md:text-[28px] ${accent ? "text-accent-text" : ""}`}>{value}</div>
      <div className="mt-1 text-sm">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card className="text-sm text-muted">{children}</Card>;
}

/** Controle segmentado em pílula: trilho cinza, opção ativa em preto. */
export function Segmented({ options }: { options: { label: string; href: string; active: boolean; icon?: ReactNode }[] }) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-track p-1 text-sm">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          className={`flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-colors ${
            o.active ? "bg-primary text-on-primary" : "text-muted hover:text-text"
          }`}
        >
          {o.icon}
          {o.label}
        </Link>
      ))}
    </div>
  );
}
