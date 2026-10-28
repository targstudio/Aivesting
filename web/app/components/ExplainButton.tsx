"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { API_URL } from "@/lib/api";

export function ExplainButton({ ticker }: { ticker: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");

  async function run() {
    setState("loading");
    try {
      const res = await fetch(`${API_URL}/assets/${ticker}/explain`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      setText((await res.json()).explanation);
      setState("done");
    } catch (e) {
      setText(e instanceof Error ? e.message : "Erro ao gerar explicação.");
      setState("error");
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={state === "loading"}
        className="inline-flex items-center gap-2 rounded border border-primary px-4 py-2 text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-60"
      >
        <Sparkles size={18} />
        {state === "loading" ? "Analisando..." : "Por que está nessa posição?"}
      </button>
      {state !== "idle" && state !== "loading" && (
        <div className={`mt-4 whitespace-pre-line text-sm leading-relaxed ${state === "error" ? "text-negative" : ""}`}>
          {text}
        </div>
      )}
    </div>
  );
}
