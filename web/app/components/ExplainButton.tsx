"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useApp } from "./AppProvider";
import { Markdown } from "./Markdown";

/** Explicação da IA para a posição do ativo. Com a leitura automática ligada, aparece ao abrir a página. */
export function ExplainButton({ ticker }: { ticker: string }) {
  const { ready, prefs } = useApp();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");

  const run = useCallback(async () => {
    setState("loading");
    try {
      const body = await apiFetch<{ explanation: string }>(`/assets/${ticker}/explain?nivel=${prefs.level}`, { method: "POST" });
      setText(body.explanation);
      setState("done");
    } catch (e) {
      setText(e instanceof Error ? e.message : "Erro ao gerar explicação.");
      setState("error");
    }
  }, [ticker, prefs.level]);

  useEffect(() => {
    if (ready && prefs.aiAuto) run();
  }, [ready, prefs.aiAuto, run]);

  return (
    <div>
      {(state === "idle" || state === "error") && (
        <button
          onClick={run}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          <Sparkles size={18} />
          {state === "error" ? "Tentar de novo" : "Por que está nessa posição?"}
        </button>
      )}
      {state === "loading" && (
        <div className="space-y-2" aria-label="Analisando">
          {[95, 100, 70].map((w) => (
            <div key={w} style={{ width: `${w}%` }} className="h-3.5 animate-pulse rounded-full bg-track" />
          ))}
        </div>
      )}
      {(state === "done" || state === "error") && (
        <Markdown text={text} className={`mt-4 text-sm leading-relaxed ${state === "error" ? "text-negative" : ""}`} />
      )}
    </div>
  );
}
