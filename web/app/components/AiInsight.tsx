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
 * Leitura da IA para a tela atual. A última leitura fica guardada (no navegador e na API) e só é gerada de novo
 * quando a pessoa clica em "Atualizar", então abrir a tela várias vezes não gasta tokens.
 */
export function AiInsight({
  context,
  title = "Resumo da IA",
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

  const storeKey = `aivesting.leitura:${context}:${prefs.level}`;

  /** `refresh` pede uma leitura nova à IA; sem ele, a API devolve a última guardada (sem gastar tokens). */
  const run = useCallback(async (refresh = false) => {
    setState("loading");
    try {
      const params = new URLSearchParams({ contexto: context, nivel: prefs.level });
      if (refresh) params.set("atualizar", "true");
      const r = await apiFetch<Reading>(`/ia/leitura?${params}`);
      setReading(r);
      try {
        localStorage.setItem(storeKey, JSON.stringify(r));
      } catch {}
      setState("done");
    } catch (e) {
      setAsleep(e instanceof ApiNetworkError);
      setError(e instanceof Error ? e.message : "Não foi possível gerar o resumo.");
      setState("error");
    }
  }, [context, prefs.level, storeKey]);

  // Falhou porque a API estava dormindo: tenta de novo sozinho quando ela acordar.
  useEffect(() => {
    if (asleep && api.phase === "online") {
      setAsleep(false);
      run();
    }
  }, [asleep, api.phase, run]);

  // Ao abrir a tela, mostra a última leitura guardada neste navegador; só pede à API se ainda não houver nenhuma.
  useEffect(() => {
    if (!ready) return;
    let saved: Reading | null = null;
    try {
      const raw = localStorage.getItem(storeKey);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}
    if (saved) {
      setReading(saved);
      setState("done");
    } else if (prefs.aiAuto) run();
    else setState("idle");
  }, [ready, prefs.aiAuto, storeKey, run]);

  const when = reading
    ? new Date(reading.generated_at).toDateString() === new Date().toDateString()
      ? `hoje às ${formatTime(reading.generated_at)}`
      : new Date(reading.generated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

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
          {reading && state === "done" && <span>gerada {when}</span>}
          {state === "done" && (
            <button
              onClick={() => run(true)}
              title="Pede um resumo novo à IA"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-semibold text-text hover:bg-track"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          )}
        </div>
      </div>

      {state === "idle" && (
        <button
          onClick={() => run()}
          className="inline-flex items-center gap-2 rounded-full bg-accent-bg px-5 py-2.5 text-sm font-semibold text-accent-text"
        >
          <Sparkles size={16} /> Pedir resumo da IA
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
          {asleep ? "O app está acordando; o resumo aparece sozinho em até 1 minuto." : error}{" "}
          {!asleep && (
            <button onClick={() => run()} className="font-semibold underline">
              Tentar de novo
            </button>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted">Feito pela IA a partir dos dados do app. Não é recomendação.</span>
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
