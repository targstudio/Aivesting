"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch, type B3Asset } from "@/lib/api";
import type { Phase, Setup } from "@/lib/trading";

export function SetupBadge({ setup }: { setup: Pick<Setup, "label" | "direction"> }) {
  const tone =
    setup.direction === "alta"
      ? "bg-positive/10 text-positive"
      : setup.direction === "baixa"
        ? "bg-negative/10 text-negative"
        : "bg-surface-2 text-muted";
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{setup.label}</span>;
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  const color = phase.aberto ? "bg-positive" : phase.fase === "fechado" ? "bg-muted" : "bg-primary";
  return (
    <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold">
      <span className={`h-2 w-2 rounded-full ${color} ${phase.aberto ? "animate-pulse" : ""}`} />
      {phase.label}
    </span>
  );
}

/** Campo de ticker com busca na lista completa da B3. */
export function TickerSearch({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<B3Asset[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    if (!open || q.length < 2) return setItems([]);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      apiFetch<{ ativos: B3Asset[] }>(`/b3/ativos?q=${encodeURIComponent(q)}&limite=8`)
        .then((r) => setItems(r.ativos))
        .catch(() => setItems([]));
    }, 200);
  }, [q, open]);

  function pick(t: string) {
    setOpen(false);
    setQ(t);
    onPick(t);
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = q.trim().toUpperCase();
          if (/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(t)) pick(t);
          else if (items[0]) pick(items[0].ticker);
        }}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
      >
        <Search size={16} className="text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Ticker ou empresa"
          className="w-36 bg-transparent text-sm font-bold uppercase outline-none"
          aria-label="Ticker"
        />
      </form>
      {open && items.length > 0 && (
        <ul className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {items.map((a) => (
            <li key={a.ticker}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a.ticker)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="font-bold">{a.ticker}</span>
                <span className="truncate text-xs text-muted">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
