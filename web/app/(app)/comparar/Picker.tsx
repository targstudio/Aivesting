"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export const MAX_ASSETS = 4;

/** Escolha de 2 a 4 ativos; a seleção fica na URL (?ativos=PETR4,VALE3) para poder compartilhar. */
export function Picker({ selected, options }: { selected: string[]; options: { ticker: string; name: string }[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const go = (list: string[]) => router.push(list.length ? `/comparar?ativos=${list.join(",")}` : "/comparar");
  const add = (t: string) => {
    setQuery("");
    if (!selected.includes(t) && selected.length < MAX_ASSETS) go([...selected, t]);
  };
  const q = query.trim().toUpperCase();
  const matches = q
    ? options.filter((o) => !selected.includes(o.ticker) && (o.ticker.includes(q) || o.name.toUpperCase().includes(q))).slice(0, 6)
    : [];

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-4 pr-2 text-sm font-semibold">
            {t}
            <button aria-label={`Tirar ${t}`} onClick={() => go(selected.filter((s) => s !== t))} className="rounded-full p-0.5 text-muted hover:text-text">
              <X size={15} />
            </button>
          </span>
        ))}
        {selected.length < MAX_ASSETS && (
          <div className="relative">
            <span className="flex items-center gap-2 rounded-full border border-dashed border-border bg-background px-4 py-1.5 text-sm focus-within:border-primary">
              <Plus size={15} className="text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) add(matches[0].ticker);
                }}
                placeholder="Adicionar (ex.: PETR4)"
                aria-label="Adicionar investimento"
                className="w-36 bg-transparent outline-none"
              />
            </span>
            {matches.length > 0 && (
              <ul className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                {matches.map((m) => (
                  <li key={m.ticker}>
                    <button onClick={() => add(m.ticker)} className="flex w-full items-baseline gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
                      <span className="font-semibold">{m.ticker}</span>
                      <span className="truncate text-xs text-muted">{m.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {selected.length < 2 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          Sugestões:
          {[["PETR4", "VALE3"], ["ITUB4", "BBDC4", "BBAS3"], ["MXRF11", "XPLG11", "KNRI11"]].map((pair) => (
            <button key={pair.join()} onClick={() => go(pair)} className="font-semibold text-accent-text hover:underline">
              {pair.join(" x ")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
