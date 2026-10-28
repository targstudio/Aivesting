"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch, type AlertKind, type AlertResult, type Level } from "@/lib/api";

// Preferências e alertas ficam no navegador enquanto o login (Supabase Auth) não está ligado.

export type Prefs = {
  name: string;
  level: Level;
  /** Gera a leitura da IA sozinha ao abrir cada tela. */
  aiAuto: boolean;
  notifications: boolean;
  alertMinutes: number;
};

export const DEFAULT_PREFS: Prefs = {
  name: "",
  level: "iniciante",
  aiAuto: true,
  notifications: false,
  alertMinutes: 5,
};

export type StoredAlert = {
  id: string;
  ticker: string;
  kind: AlertKind;
  value: number;
  createdAt: string;
  /** Preenchido quando a regra é atingida; o alerta para de ser avaliado até ser reativado. */
  triggeredAt?: string;
  checkedAt?: string;
  message?: string;
  available?: boolean;
  explanation?: string;
  seen?: boolean;
};

type AskOptions = { prompt?: string };

type AppState = {
  ready: boolean;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  alerts: StoredAlert[];
  saveAlerts: (fn: (a: StoredAlert[]) => StoredAlert[]) => void;
  checkAlerts: () => Promise<void>;
  checking: boolean;
  unseen: number;
  ai: { open: boolean; prompt?: string; nonce: number };
  askAI: (o?: AskOptions) => void;
  closeAI: () => void;
  resetAll: () => void;
};

const Ctx = createContext<AppState | null>(null);
const PREFS_KEY = "aivesting.prefs";
const ALERTS_KEY = "aivesting.alerts";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navegação privada ou armazenamento bloqueado: segue só em memória.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [alerts, setAlerts] = useState<StoredAlert[]>([]);
  const [checking, setChecking] = useState(false);
  const [ai, setAi] = useState<{ open: boolean; prompt?: string; nonce: number }>({ open: false, nonce: 0 });
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    setPrefsState(load(PREFS_KEY, DEFAULT_PREFS));
    setAlerts(loadList<StoredAlert>(ALERTS_KEY));
    setReady(true);
  }, []);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      persist(PREFS_KEY, next);
      return next;
    });
  }, []);

  const saveAlerts = useCallback((fn: (a: StoredAlert[]) => StoredAlert[]) => {
    setAlerts((cur) => {
      const next = fn(cur);
      persist(ALERTS_KEY, next);
      return next;
    });
  }, []);

  const checkAlerts = useCallback(async () => {
    const active = alertsRef.current.filter((a) => !a.triggeredAt);
    if (!active.length) return;
    setChecking(true);
    try {
      const { resultados } = await apiFetch<{ resultados: AlertResult[] }>("/alertas/avaliar", {
        method: "POST",
        body: JSON.stringify({ alerts: active.map(({ id, ticker, kind, value }) => ({ id, ticker, kind, value })) }),
      });
      const byId = new Map(resultados.map((r) => [r.id, r]));
      const now = new Date().toISOString();
      const fired: AlertResult[] = [];
      saveAlerts((cur) =>
        cur.map((a) => {
          const r = byId.get(a.id);
          if (!r || a.triggeredAt) return a;
          if (r.triggered) fired.push(r);
          return {
            ...a,
            checkedAt: now,
            message: r.message,
            available: r.available,
            ...(r.triggered ? { triggeredAt: now, seen: false, explanation: undefined } : {}),
          };
        }),
      );
      if (fired.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const r of fired) new Notification(`Alerta: ${r.ticker}`, { body: r.message });
      }
    } catch {
      // API fora do ar: tenta de novo no próximo ciclo.
    } finally {
      setChecking(false);
    }
  }, [saveAlerts]);

  // Avalia os alertas ao abrir o app e a cada `alertMinutes`, em qualquer tela.
  useEffect(() => {
    if (!ready) return;
    checkAlerts();
    const id = setInterval(checkAlerts, Math.max(1, prefs.alertMinutes) * 60_000);
    return () => clearInterval(id);
  }, [ready, prefs.alertMinutes, checkAlerts]);

  const askAI = useCallback((o?: AskOptions) => setAi((s) => ({ open: true, prompt: o?.prompt, nonce: s.nonce + 1 })), []);
  const closeAI = useCallback(() => setAi((s) => ({ ...s, open: false, prompt: undefined })), []);

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(PREFS_KEY);
      localStorage.removeItem(ALERTS_KEY);
    } catch {}
    setPrefsState(DEFAULT_PREFS);
    setAlerts([]);
  }, []);

  const unseen = alerts.filter((a) => a.triggeredAt && !a.seen).length;

  return (
    <Ctx.Provider
      value={{ ready, prefs, setPrefs, alerts, saveAlerts, checkAlerts, checking, unseen, ai, askAI, closeAI, resetAll }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}
