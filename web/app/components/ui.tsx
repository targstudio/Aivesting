import { ChevronRight, House, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
      <Link href="/" className="flex items-center gap-1 font-medium hover:text-text">
        <House size={16} /> Início
      </Link>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <ChevronRight size={14} className="text-muted" />
          {item.href ? (
            <Link href={item.href} className="font-medium hover:text-text">
              {item.label}
            </Link>
          ) : (
            <span className="text-text">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageTitle({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="mb-1 text-sm text-muted">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight md:text-[28px] md:leading-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent-text/20 bg-accent-bg/60 px-4 py-3 text-sm text-accent-text">
      <Info size={18} className="mt-0.5 shrink-0" />
      <div className="font-medium">{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-border bg-surface p-5 md:p-6 ${className}`}>{children}</section>;
}

export function Stat({ value, label, accent = false, sub }: { value: string; label: ReactNode; accent?: boolean; sub?: ReactNode }) {
  return (
    <div>
      <div className={`tabular text-2xl font-bold tracking-tight ${accent ? "text-accent-text" : ""}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card className="text-sm text-muted">{children}</Card>;
}

/** Controle segmentado: trilho escuro, opção ativa destacada. */
export function Segmented({ options }: { options: { label: string; href: string; active: boolean; icon?: ReactNode }[] }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 text-sm">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors ${
            o.active ? "bg-surface-2 text-text ring-1 ring-border" : "text-muted hover:text-text"
          }`}
        >
          {o.icon}
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** Cabeçalho de card no estilo do painel: título, subtítulo discreto e valor de destaque à direita. */
export function CardHeader({ title, subtitle, value, action }: { title: string; subtitle?: string; value?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {value !== undefined && <div className="tabular text-right text-xl font-bold">{value}</div>}
      {action}
    </div>
  );
}

/** Caixinha de métrica com barra de cor à esquerda (como os mini cards da referência). */
export function MiniStat({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
        <span className="h-3.5 w-1 rounded-full" style={{ background: color }} />
        <span className="tabular">{value}</span>
      </div>
    </div>
  );
}
