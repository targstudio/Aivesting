"use client";

import { useEffect } from "react";
import { ACCOUNT_EVENT, currentSnapshot, loadSession, pullData, pushData } from "@/lib/account";

/**
 * Com sessão ativa, traz os dados da conta ao abrir o app e sobe as mudanças. Em vez de mexer em cada lugar que
 * grava no navegador, confere as chaves a cada poucos segundos e envia quando algo mudou.
 */
export function AccountSync() {
  useEffect(() => {
    let last: string | null = null;
    let busy = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let active = false;

    const start = async () => {
      clearInterval(timer);
      active = !!loadSession();
      if (!active) return;
      try {
        if (await pullData()) {
          window.location.reload();
          return;
        }
      } catch {
        // API dormindo ou sessão inválida: tenta de novo no próximo ciclo.
      }
      last = currentSnapshot();
      timer = setInterval(async () => {
        if (busy || !loadSession()) return;
        const now = currentSnapshot();
        if (now === last) return;
        busy = true;
        try {
          last = (await pushData()) ?? last;
        } catch {
        } finally {
          busy = false;
        }
      }, 5000);
    };

    // Só reinicia quando a pessoa entra ou sai; a renovação do token também dispara o evento.
    const onChange = () => {
      if (!!loadSession() !== active) start();
    };
    start();
    window.addEventListener(ACCOUNT_EVENT, onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener(ACCOUNT_EVENT, onChange);
    };
  }, []);
  return null;
}
