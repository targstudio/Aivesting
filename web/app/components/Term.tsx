"use client";

import { BookOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { useApp } from "./AppProvider";

/** Termo com sublinhado pontilhado: um toque abre a explicação simples, com atalho para a Enciclopédia e a IA. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Balão em portal com posição fixa: tabelas com rolagem e colunas fixas cortariam ou cobririam um balão absoluto.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const { askAI } = useApp();
  const entry = GLOSSARY[k];

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popup.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const width = Math.min(288, window.innerWidth * 0.8);
          setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 8 });
          setOpen((o) => !o);
        }}
        className="cursor-help underline decoration-muted decoration-dotted underline-offset-4 hover:decoration-text"
        aria-expanded={open}
      >
        {children ?? entry.term}
      </button>
      {open && pos && createPortal(
        <span
          ref={popup}
          role="dialog"
          style={pos}
          className="fixed z-50 block w-72 max-w-[80vw] rounded-xl border border-border bg-surface p-4 text-left text-sm font-normal normal-case tracking-normal text-text shadow-lg"
        >
          <span className="mb-1 block font-semibold">{entry.term}</span>
          <span className="block text-muted">{entry.text}</span>
          <span className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
            <Link href={`/enciclopedia#termo-${k}`} className="inline-flex items-center gap-1 text-accent-text hover:underline">
              <BookOpen size={13} /> Glossário
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                askAI({ prompt: `Explique "${entry.term}" com um exemplo usando os números do app.` });
              }}
              className="inline-flex items-center gap-1 text-accent-text hover:underline"
            >
              <Sparkles size={13} /> Perguntar à IA
            </button>
          </span>
        </span>,
        document.body,
      )}
    </span>
  );
}
