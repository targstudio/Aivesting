"use client";

import { MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiNetworkError, apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { useApiStatus } from "./ApiStatus";
import { useApp } from "./AppProvider";
import { Markdown } from "./Markdown";

type Reading = { text: string; generated_at: string; cached: boolean };

/**
 * Leitura da IA para a tela atual. O texto é gerado pela API a partir dos dados do app e fica em cache por
 * alguns minutos no servidor, então abrir a tela várias vezes não gasta cota.
 */
export function AiInsight({
  context,
  title = "Leitura da IA",
  askPrompt,
}: {
  context: string;
  title?: string;
  /** Pergunta sugerida ao abrir o chat a partir deste card. */
  askPrompt?: string;
}) {
  const { ready, prefs, askAI } = useApp();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState("");
  const [asleep, setAsleep] = useState(false);
  const api = useApiStatus();

  const run = useCallback(async () => {
    setState("loading");
    try {
      const params = new URLSearchParams({ contexto: context, nivel: prefs.level });
      setReading(await apiFetch<Reading>(`/ia/leitura?${params}`));
      setState("done");
    } catch (e) {
      setAsleep(e instanceof ApiNetworkError);
      setError(e instanceof Error ? e.message : "Não foi possível gerar a leitura.");
      setState("error");
    }
  }, [context, prefs.level]);

  // Falhou porque a API estava dormindo: tenta de novo sozinho quando ela acordar.
  useEffect(() => {
    if (asleep && api.phase === "online") {
      setAsleep(false);
      run();
    }
  }, [asleep, api.phase, run]);

  useEffect(() => {
    if (ready && prefs.aiAuto) run();
    else setState("idle");
  }, [ready, prefs.aiAuto, run]);

  return (
    <section className="mb-6 rounded-card border border-border bg-gradient-to-br from-surface-2 to-surface p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent-text">
            <Sparkles size={16} />
          </span>
          {title}
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          {reading && state === "done" && <span>gerada às {formatTime(reading.generated_at)}</span>}
          {state === "done" && (
            <button onClick={run} aria-label="Gerar de novo" className="rounded-full p-1.5 hover:bg-track">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      {state === "idle" && (
        <button
          onClick={run}
          className="inline-flex items-center gap-2 rounded-full bg-accent-bg px-5 py-2.5 text-sm font-semibold text-accent-text"
        >
          <Sparkles size={16} /> Gerar leitura da IA
        </button>
      )}
      {state === "loading" && (
        <div className="space-y-2" aria-label="Gerando leitura">
          {[92, 100, 75].map((w) => (
            <div key={w} style={{ width: `${w}%` }} className="h-3.5 animate-pulse rounded-full bg-track" />
          ))}
        </div>
      )}
      {state === "done" && reading && <Markdown text={reading.text} className="text-sm leading-relaxed text-text/90 md:text-[15px]" />}
      {state === "error" && (
        <p className="text-sm text-muted">
          {asleep ? "A API está acordando; a leitura aparece sozinha quando o indicador do topo ficar verde." : error}{" "}
          {!asleep && (
            <button onClick={run} className="font-semibold underline">
              Tentar de novo
            </button>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted">Gerada pela Claude a partir dos dados do app. Não é recomendação.</span>
        <button
          onClick={() => askAI({ prompt: askPrompt })}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-track"
        >
          <MessageCircle size={16} /> Perguntar mais
        </button>
      </div>
    </section>
  );
}
