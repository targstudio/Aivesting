"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { RankedAsset } from "@/lib/api";
import { AssetLogo } from "./AssetLogo";
import { Sparkline } from "./Sparkline";
import { changeColor, formatBRL, formatNumber, formatPercent, formatProbability } from "@/lib/format";

// `compact` esconde a coluna de preço, para listas em meia largura (ex.: página inicial).
export function RankingList({
  assets,
  benchmark,
  compact = false,
}: {
  assets: RankedAsset[];
  benchmark: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {assets.map((a) => {
        const expanded = open === a.ticker;
        return (
          <div key={a.ticker} className="rounded-3xl border border-border bg-surface">
            <button
              onClick={() => setOpen(expanded ? null : a.ticker)}
              className={`grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-3 px-4 py-4 text-left md:px-6 ${
                compact ? "md:grid-cols-[1.75rem_1fr_5rem_7rem_1.5rem]" : "md:grid-cols-[2rem_1fr_6rem_7rem_7rem_8rem_2rem]"
              }`}
              aria-expanded={expanded}
            >
              <span className="tabular text-center text-sm font-bold text-muted">{a.rank}º</span>
              <span className="flex min-w-0 items-center gap-3">
                <AssetLogo ticker={a.ticker} src={a.logo_url} />
                <span className="min-w-0">
                <span className="block truncate font-bold">{a.ticker}</span>
                <span className="block truncate text-sm text-muted">{a.name}</span>
                </span>
              </span>
              <span className={compact ? "hidden" : "hidden md:block"}>
                <span className="block text-xs text-muted">Preço</span>
                <span className="tabular block">{formatBRL(a.price)}</span>
              </span>
              {!compact && (
                <span className="hidden md:block" title="Últimos 30 pregões">
                  <Sparkline values={a.spark ?? []} width={88} height={30} />
                </span>
              )}
              <span className="hidden md:block">
                <span className="block text-xs text-muted">Dia</span>
                <span className={`tabular block ${changeColor(a.change_percent)}`}>{formatPercent(a.change_percent)}</span>
              </span>
              <span className="text-right md:text-left">
                <span className="block text-xs text-muted">Prob. vs {benchmark}</span>
                <span className="tabular block font-bold text-accent-text">{formatProbability(a.probability_outperform)}</span>
              </span>
              <ChevronDown size={20} className={`hidden transition-transform md:block ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && (
              <div className="border-t border-border px-4 py-4 text-sm md:px-6">
                <p className="mb-3 text-muted">Score {formatNumber(a.score)}/100. Fatores que mais pesaram:</p>
                <ul className="mb-4 flex flex-col gap-2">
                  {a.top_factors.map((f) => (
                    <li key={f.factor} className="flex justify-between gap-4">
                      <span>{f.label}</span>
                      <span className={`tabular ${changeColor(f.contribution)}`}>
                        {f.contribution > 0 ? "favorece" : "pesa contra"}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/ativo/${a.ticker}`}
                  className="inline-flex rounded-full bg-primary px-5 py-2.5 font-semibold text-on-primary"
                >
                  Ver análise completa
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
