"use client";

import { BellPlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useApp } from "./AppProvider";

export function AssetActions({ ticker }: { ticker: string }) {
  const { askAI } = useApp();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <button
        onClick={() => askAI({ prompt: `Me explique ${ticker}: posição no ranking, histórico e comportamento nas crises.` })}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
      >
        <Sparkles size={16} /> Perguntar à IA sobre {ticker}
      </button>
      <Link
        href={`/alertas?ticker=${ticker}`}
        className="inline-flex items-center gap-2 rounded-full bg-accent-bg px-5 py-2.5 text-sm font-semibold text-accent-text"
      >
        <BellPlus size={16} /> Criar alerta
      </Link>
    </div>
  );
}
