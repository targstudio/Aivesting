"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { API_DOWN_EVENT, API_URL } from "@/lib/api";

/** No plano gratuito do Render a API dorme sem uso e leva perto de 1 minuto para acordar. */
const WAKE_SECONDS = 60;
const GIVE_UP_SECONDS = 150;
const RETRY_MS = 5_000;
const ONLINE_CHECK_MS = 2 * 60_000; // também mantém a API acordada enquanto o app está aberto

type Phase = "checking" | "waking" | "online" | "offline";
type Status = { phase: Phase; left: number; ai: boolean; retry: () => void };

const Ctx = createContext<Status>({ phase: "checking", left: WAKE_SECONDS, ai: true, retry: () => {} });

async function ping(): Promise<{ ai: boolean } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return { ai: Boolean(body.ai) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function ApiStatusProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [ai, setAi] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const wakeStart = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("checking");
  phaseRef.current = phase;

  const check = useCallback(async () => {
    const r = await ping();
    if (r) {
      setAi(r.ai);
      wakeStart.current = null;
      setPhase("online");
      return;
    }
    if (wakeStart.current == null) wakeStart.current = Date.now();
    const secs = (Date.now() - wakeStart.current) / 1000;
    setPhase(secs > GIVE_UP_SECONDS ? "offline" : "waking");
  }, []);

  const retry = useCallback(() => {
    wakeStart.current = Date.now();
    setElapsed(0);
    setPhase("waking");
    check();
  }, [check]);

  // Verificação inicial e periódica: rápida enquanto acorda, espaçada quando está no ar.
  useEffect(() => {
    check();
  }, [check]);
  useEffect(() => {
    if (phase === "offline") return;
    const id = setInterval(check, phase === "online" ? ONLINE_CHECK_MS : RETRY_MS);
    return () => clearInterval(id);
  }, [phase, check]);

  // Relógio da contagem regressiva.
  useEffect(() => {
    if (phase !== "waking" && phase !== "checking") return;
    const id = setInterval(() => {
      setElapsed(wakeStart.current ? Math.floor((Date.now() - wakeStart.current) / 1000) : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Qualquer chamada que falhou por rede volta o indicador para "acordando".
  useEffect(() => {
    const onDown = () => {
      if (phaseRef.current === "online" || phaseRef.current === "checking") {
        wakeStart.current = Date.now();
        setElapsed(0);
        setPhase("waking");
      }
    };
    window.addEventListener(API_DOWN_EVENT, onDown);
    return () => window.removeEventListener(API_DOWN_EVENT, onDown);
  }, []);

  const left = Math.max(0, WAKE_SECONDS - elapsed);
  return <Ctx.Provider value={{ phase, left, ai, retry }}>{children}</Ctx.Provider>;
}

export function useApiStatus() {
  return useContext(Ctx);
}

export function formatClock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Indicador discreto do topo: verde quando a IA pode responder, contagem regressiva enquanto a API acorda. */
export function ApiStatusPill() {
  const { phase, left, ai, retry } = useApiStatus();
  const ready = phase === "online" && ai;
  const dot =
    phase === "online"
      ? ai
        ? "bg-positive"
        : "bg-muted"
      : phase === "offline"
        ? "bg-negative"
        : "bg-accent-text animate-pulse";
  const label =
    phase === "checking"
      ? "Conectando..."
      : phase === "online"
        ? ai
          ? "IA pronta"
          : "IA desligada"
        : phase === "waking"
          ? left > 0
            ? `Acordando a IA · ${formatClock(left)}`
            : "Quase lá..."
          : "API fora do ar";
  const short =
    phase === "online" ? (ai ? "IA" : "IA off") : phase === "waking" ? formatClock(left) : phase === "offline" ? "Fora" : "...";
  const title = ready
    ? "A API está no ar: pode perguntar à IA."
    : phase === "waking"
      ? "No plano gratuito a API dorme sem uso e leva cerca de 1 minuto para acordar."
      : phase === "offline"
        ? "A API não respondeu. Clique para tentar de novo."
        : undefined;
  const content = (
    <>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="tabular hidden whitespace-nowrap sm:inline">{label}</span>
      <span className="tabular whitespace-nowrap sm:hidden">{short}</span>
    </>
  );
  const cls = "flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold text-muted";
  return phase === "offline" ? (
    <button onClick={retry} title={title} className={`${cls} hover:bg-surface`} aria-live="polite">
      {content}
      <span className="underline">tentar de novo</span>
    </button>
  ) : (
    <span title={title} className={cls} role="status" aria-live="polite">
      {content}
    </span>
  );
}
