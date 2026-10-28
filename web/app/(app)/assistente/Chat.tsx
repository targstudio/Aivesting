"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/app/components/AppProvider";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Como está o mercado hoje no Brasil e lá fora?",
  "Quais FIIs estão no topo do ranking agora?",
  "Por que a PETR4 está nessa posição?",
  "Como a Selic atual afeta os fundos imobiliários?",
];

/** Perguntas sugeridas conforme a tela em que o chat foi aberto. */
function suggestionsFor(page?: string): string[] {
  if (!page) return SUGGESTIONS;
  const ticker = page.match(/^\/ativo\/([^/?]+)/)?.[1]?.toUpperCase();
  if (ticker)
    return [
      `Por que ${ticker} está nessa posição do ranking?`,
      `Como ${ticker} se saiu nas crises?`,
      `Compare ${ticker} com o índice nos últimos 10 anos`,
    ];
  if (page.startsWith("/mercado"))
    return ["Resuma o pregão de hoje", "O que mais subiu e caiu entre os ativos do app?", "Como estão as bolsas lá fora?"];
  if (page.startsWith("/ranking"))
    return ["O que os primeiros do ranking têm em comum?", "Compare as 3 primeiras ações do ranking", "Como o modelo calcula a probabilidade?"];
  if (page.startsWith("/horizontes"))
    return ["Explique o ranking de 10 anos de forma simples", "Por que o modelo não foi validado em alguns horizontes?", "Como as ações se saíram em cenários parecidos com o atual?"];
  if (page.startsWith("/macro"))
    return ["O que a Selic atual significa para quem investe?", "Como a inflação afeta os FIIs?", "O dólar subiu ou caiu?"];
  if (page.startsWith("/alertas"))
    return ["Que tipo de alerta posso criar?", "Quais ativos variaram mais hoje?", "O que significa a probabilidade de superar o índice?"];
  return SUGGESTIONS;
}

const TOOL_LABELS: Record<string, string> = {
  get_ranking: "ranking",
  get_asset: "ativo",
  get_macro: "macro",
  get_market: "mercado",
  get_horizon_ranking: "horizontes",
  get_asset_history: "histórico",
};

export function Chat({ compact = false, page, initialPrompt }: { compact?: boolean; page?: string; initialPrompt?: string }) {
  const { prefs } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<Record<number, string[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const body = await apiFetch<{ reply: string; tools_used: string[] }>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next, page, level: prefs.level }),
      });
      setMessages([...next, { role: "assistant", content: body.reply }]);
      setSources((s) => ({ ...s, [next.length]: [...new Set<string>(body.tools_used)] }));
    } catch (e) {
      setMessages([...next, { role: "assistant", content: e instanceof Error ? e.message : "Erro inesperado." }]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <section
      className={
        compact
          ? "flex h-full flex-col p-4"
          : "flex min-h-[60vh] flex-col rounded-card border border-border bg-surface p-4 md:p-8"
      }
    >
      <div className={`flex-1 space-y-4 ${compact ? "overflow-y-auto" : ""}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-4 py-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-on-primary">
              <Sparkles size={22} />
            </span>
            <p className="text-muted">Comece com uma destas perguntas ou escreva a sua:</p>
            <div className="flex flex-wrap gap-2">
              {suggestionsFor(page).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full bg-accent-bg px-4 py-2 text-left text-sm font-semibold text-accent-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-line rounded-3xl px-5 py-3 text-sm leading-relaxed ${compact ? "" : "md:max-w-[70%]"} ${
                m.role === "user" ? "bg-primary text-on-primary" : "bg-track"
              }`}
            >
              {m.content}
              {sources[i]?.length ? (
                <div className="mt-2 text-xs text-muted">
                  Consultou: {sources[i].map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-3xl bg-track px-5 py-3 text-sm text-muted">Consultando os dados...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 pl-5 focus-within:border-primary"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre um ativo, o mercado ou o cenário macro"
          maxLength={4000}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:bg-track disabled:text-muted"
        >
          <ArrowUp size={18} />
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-muted">A IA explica dados; ela não recomenda compra ou venda.</p>
    </section>
  );
}
