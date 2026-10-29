"use client";

import { MessageCircle, RefreshCw, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { useApp } from "./AppProvider";
import { Markdown } from "./Markdown";

type Item = { titulo: string; texto: string };
type Swot = { resumo: string; forcas: Item[]; fraquezas: Item[]; oportunidades: Item[]; ameacas: Item[] };
type SwotResponse = { swot: Swot; generated_at: string };

const QUADRANTS: { key: keyof Omit<Swot, "resumo">; title: string; hint: string; icon: ReactNode; tone: string }[] = [
  { key: "forcas", title: "Forças", hint: "do próprio ativo", icon: <ThumbsUp size={16} />, tone: "bg-positive/10 text-positive" },
  { key: "fraquezas", title: "Fraquezas", hint: "do próprio ativo", icon: <ThumbsDown size={16} />, tone: "bg-negative/10 text-negative" },
  { key: "oportunidades", title: "Oportunidades", hint: "do cenário", icon: <TrendingUp size={16} />, tone: "bg-chart-5/10 text-chart-5" },
  { key: "ameacas", title: "Ameaças", hint: "do cenário", icon: <ShieldAlert size={16} />, tone: "bg-accent-bg text-accent-text" },
];

/**
 * Análise SWOT do ativo feita pela IA, juntando os dados do ativo com o cenário macro do Brasil e do mundo.
 * A última fica guardada (no navegador e na API) e só é gerada de novo quando a pessoa clica em "Atualizar".
 */
export function SwotAnalysis({ ticker }: { ticker: string }) {
  const { ready, prefs, askAI } = useApp();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<SwotResponse | null>(null);
  const [error, setError] = useState("");
  const storeKey = `aivesting.swot:${ticker}:${prefs.level}`;

  const run = useCallback(
    async (refresh = false) => {
      setState("loading");
      try {
        const q = new URLSearchParams({ nivel: prefs.level });
        if (refresh) q.set("atualizar", "true");
        const body = await apiFetch<SwotResponse>(`/assets/${ticker}/swot?${q}`, { method: "POST" });
        setData(body);
        try {
          localStorage.setItem(storeKey, JSON.stringify(body));
        } catch {}
        setState("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao gerar a análise SWOT.");
        setState("error");
      }
    },
    [ticker, prefs.level, storeKey],
  );

  useEffect(() => {
    if (!ready) return;
    let saved: SwotResponse | null = null;
    try {
      const raw = localStorage.getItem(storeKey);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}
    if (saved?.swot) {
      setData(saved);
      setState("done");
    } else if (prefs.aiAuto) run();
    else setState("idle");
  }, [ready, prefs.aiAuto, storeKey, run]);

  const when = data
    ? new Date(data.generated_at).toDateString() === new Date().toDateString()
      ? `hoje às ${formatTime(data.generated_at)}`
      : new Date(data.generated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <section className="mb-6 rounded-card border border-border bg-surface p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2.5 text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent-text">
              <Sparkles size={16} />
            </span>
            Análise SWOT
          </h2>
          <p className="mt-1 text-sm text-muted">
            Forças e fraquezas de {ticker} com oportunidades e ameaças do cenário no Brasil e no mundo.
          </p>
        </div>
        {state === "done" && (
          <div className="flex items-center gap-2 text-xs text-muted">
            {when && <span>gerada {when}</span>}
            <button
              onClick={() => run(true)}
              title="Pede uma análise nova à IA (gasta tokens)"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-semibold text-text hover:bg-track"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>
        )}
      </div>

      {(state === "idle" || state === "error") && (
        <div>
          {state === "error" && <p className="mb-3 text-sm text-negative">{error}</p>}
          <button
            onClick={() => run()}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Sparkles size={18} />
            {state === "error" ? "Tentar de novo" : "Gerar análise SWOT"}
          </button>
        </div>
      )}

      {state === "loading" && (
        <div className="grid gap-4 md:grid-cols-2" aria-label="Montando a análise SWOT">
          {QUADRANTS.map((q) => (
            <div key={q.key} className="space-y-2 rounded-xl border border-border p-4">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-track" />
              {[95, 80].map((w) => (
                <div key={w} style={{ width: `${w}%` }} className="h-3 animate-pulse rounded-full bg-track" />
              ))}
            </div>
          ))}
        </div>
      )}

      {state === "done" && data && (
        <>
          {data.swot.resumo && <Markdown text={data.swot.resumo} className="mb-4 text-sm leading-relaxed text-text/90 md:text-[15px]" />}
          <div className="grid gap-4 md:grid-cols-2">
            {QUADRANTS.map((q) => (
              <div key={q.key} className="rounded-xl border border-border p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${q.tone}`}>{q.icon}</span>
                  {q.title}
                  <span className="text-xs font-normal text-muted">{q.hint}</span>
                </h3>
                {data.swot[q.key].length ? (
                  <ul className="flex flex-col gap-3">
                    {data.swot[q.key].map((item, i) => (
                      <li key={i} className="text-sm leading-relaxed">
                        <span className="font-semibold">{item.titulo}.</span> <span className="text-text/80">{item.texto}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Os dados não mostram pontos claros aqui.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted">Gerada pela Claude com os dados do app. Não é recomendação de compra ou venda.</span>
        <button
          onClick={() => askAI({ prompt: `Explique melhor a análise SWOT de ${ticker}` })}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-track"
        >
          <MessageCircle size={16} /> Perguntar mais
        </button>
      </div>
    </section>
  );
}
