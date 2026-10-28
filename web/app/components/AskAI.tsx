"use client";

import { Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Chat } from "../(app)/assistente/Chat";
import { useApp } from "./AppProvider";

/** Botão flutuante e painel lateral da IA, disponíveis em todas as telas do app. */
export function AskAI() {
  const { ai, askAI, closeAI } = useApp();
  const pathname = usePathname();

  useEffect(() => {
    if (!ai.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAI();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ai.open, closeAI]);

  // Na tela do assistente o chat já ocupa a página.
  if (pathname.startsWith("/assistente")) return null;

  return (
    <>
      {!ai.open && (
        <button
          onClick={() => askAI()}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-on-primary shadow-lg shadow-black/20 md:bottom-8 md:right-8"
        >
          <Sparkles size={18} /> Pergunte à IA
        </button>
      )}
      {ai.open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button aria-label="Fechar" onClick={closeAI} className="absolute inset-0 bg-black/30" />
          <aside className="relative flex h-full w-full max-w-md flex-col bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
                  <Sparkles size={16} />
                </span>
                <div className="leading-tight">
                  <div className="font-bold">IA do AI.vesting</div>
                  <div className="text-xs text-muted">Sabe em que tela você está e consulta os dados do app</div>
                </div>
              </div>
              <button onClick={closeAI} aria-label="Fechar" className="rounded-full p-2 hover:bg-track">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Chat key={ai.nonce} compact page={pathname} initialPrompt={ai.prompt} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
