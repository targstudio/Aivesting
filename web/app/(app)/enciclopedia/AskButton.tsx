"use client";

import { Sparkles } from "lucide-react";
import { useApp } from "@/app/components/AppProvider";

export function AskButton({ prompt }: { prompt: string }) {
  const { askAI } = useApp();
  return (
    <button
      onClick={() => askAI({ prompt })}
      className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent-bg px-4 py-2 text-sm font-semibold text-accent-text"
    >
      <Sparkles size={16} /> Perguntar à IA
    </button>
  );
}
