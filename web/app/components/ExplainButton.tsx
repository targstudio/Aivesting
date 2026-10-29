"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { useApp } from "./AppProvider";
import { Markdown } from "./Markdown";

type Explanation = { explanation: string; generated_at?: string };

/**
 * Explicação da IA para a posição do ativo. A última fica guardada (no navegador e na API) e só é gerada de novo
 * quando a pessoa clica em "Atualizar".
 */
export function ExplainButton({ ticker }: { ticker: string }) {
  const { ready, prefs } = useApp();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string | undefined>();
  const storeKey = `aivesting.explicacao:${ticker}:${prefs.level}`;

  const run = useCallback(
    async (refresh = false) => {
      setState("loading");
      try {
        const q = new URLSearchParams({ nivel: prefs.level });
        if (refresh) q.set("atualizar", "true");
        const body = await apiFetch<Explanation>(`/assets/${ticker}/explain?${q}`, { method: "POST" });
        setText(body.explanation);
        setGeneratedAt(body.generated_at);
        try {
          localStorage.setItem(storeKey, JSON.stringify(body));
        } catch {}
        setState("done");
      } catch (e) {
        setText(e instanceof Error ? e.message : "Não foi possível gerar a explicação.");
        setState("error");
      }
    },
    [ticker, prefs.level, storeKey],
  );

  useEffect(() => {
    if (!ready) return;
    let saved: Explanation | null = null;
    try {
      const raw = localStorage.getItem(storeKey);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}
    if (saved) {
      setText(saved.explanation);
      setGeneratedAt(saved.generated_at);
      setState("done");
    } else if (prefs.aiAuto) run();
  }, [ready, prefs.aiAuto, storeKey, run]);

  const when = generatedAt
    ? new Date(generatedAt).toDateString() === new Date().toDateString()
      ? `hoje às ${formatTime(generatedAt)}`
      : new Date(generatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div>
      {(state === "idle" || state === "error") && (
        <button
          onClick={() => run()}
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
      {state === "done" && (
        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          {when && <span>gerada {when}</span>}
          <button
            onClick={() => run(true)}
            title="Pede uma explicação nova à IA"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-semibold text-text hover:bg-track"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      )}
    </div>
  );
}
