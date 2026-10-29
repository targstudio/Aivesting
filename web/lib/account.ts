import { apiFetch } from "./api";

// Conta (Google, e-mail e senha ou link no e-mail). O navegador guarda a sessão e espelha no banco as chaves abaixo, para a pessoa ver a mesma
// carteira, alertas, perfil e preferências em qualquer aparelho.

export const SYNC_KEYS = ["aivesting.carteira", "aivesting.alerts", "aivesting.assessor", "aivesting.prefs", "aivesting.simulador", "aivesting.jornada"];
const SESSION_KEY = "aivesting.sessao";
const SYNCED_KEY = "aivesting.conta.sincronizado";
export const ACCOUNT_EVENT = "aivesting:conta";

export type Session = { access_token: string; refresh_token: string; expires_at: number; email: string | null };

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
}

const EXPLORE_KEY = "aivesting.explorar";
const backTo = () => `${window.location.origin}/entrar`;

type SessionReply = { access_token: string; refresh_token: string; expires_in: number; email: string | null };

function startSession(r: SessionReply) {
  saveSession({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000, email: r.email });
}

export type Providers = { available: boolean; email: boolean; google: boolean };
export const getProviders = () => apiFetch<Providers>("/conta/provedores");

/** Leva para a tela do Google; ele devolve a pessoa para /entrar com a sessão no endereço. */
export async function signInWithGoogle() {
  const r = await apiFetch<{ url: string }>(`/conta/oauth/google?redirect_to=${encodeURIComponent(backTo())}`);
  window.location.assign(r.url);
}

export async function sendLoginLink(email: string) {
  await apiFetch("/conta/entrar", { method: "POST", body: JSON.stringify({ email, redirect_to: backTo() }) });
}

export async function signInWithPassword(email: string, password: string) {
  startSession(await apiFetch<SessionReply>("/conta/login", { method: "POST", body: JSON.stringify({ email, password }) }));
}

/** Cria a conta. Devolve true quando já entrou; false quando falta confirmar o e-mail. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const r = await apiFetch<{ session: SessionReply | null }>("/conta/cadastrar", {
    method: "POST",
    body: JSON.stringify({ email, password, redirect_to: backTo() }),
  });
  if (r.session) startSession(r.session);
  return !!r.session;
}

export async function sendPasswordReset(email: string) {
  await apiFetch("/conta/esqueci-senha", { method: "POST", body: JSON.stringify({ email, redirect_to: backTo() }) });
}

export async function setNewPassword(password: string) {
  const s = loadSession();
  await apiFetch("/conta/nova-senha", {
    method: "POST",
    headers: { Authorization: `Bearer ${s?.access_token ?? ""}` },
    body: JSON.stringify({ password }),
  });
}

/** Quem escolheu "Explorar sem conta" não volta a ser mandado para a tela de entrada. */
export function chooseExplore() {
  try {
    localStorage.setItem(EXPLORE_KEY, "1");
  } catch {}
}

export function shouldShowWelcome(): boolean {
  try {
    return !loadSession() && !localStorage.getItem(EXPLORE_KEY);
  } catch {
    return false;
  }
}

/**
 * O e-mail (link, confirmação ou troca de senha) e o Google voltam para /entrar com a sessão no fragmento
 * (#access_token=...). `recovery` indica que a pessoa veio pelo e-mail de troca de senha.
 */
export function consumeLoginRedirect(): { ok: boolean; error?: string; recovery?: boolean } | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!hash.has("access_token") && !hash.has("error")) return null;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  if (hash.has("error")) return { ok: false, error: hash.get("error_description") ?? "O link expirou ou já foi usado." };
  const token = hash.get("access_token")!;
  let email: string | null = null;
  try {
    email = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? null;
  } catch {}
  saveSession({
    access_token: token,
    refresh_token: hash.get("refresh_token") ?? "",
    expires_at: Date.now() + Number(hash.get("expires_in") ?? 3600) * 1000,
    email,
  });
  return { ok: true, recovery: hash.get("type") === "recovery" };
}

export function signOut() {
  saveSession(null);
  try {
    localStorage.removeItem(SYNCED_KEY);
  } catch {}
}

async function token(): Promise<string | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expires_at - Date.now() > 60_000) return s.access_token;
  try {
    const r = await apiFetch<{ access_token: string; refresh_token: string; expires_in: number; email: string | null }>(
      "/conta/renovar",
      { method: "POST", body: JSON.stringify({ refresh_token: s.refresh_token }) },
    );
    const next = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000, email: r.email ?? s.email };
    saveSession(next);
    return next.access_token;
  } catch {
    signOut();
    return null;
  }
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SYNC_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    } catch {}
  }
  return out;
}

export async function pushData(): Promise<string | null> {
  const t = await token();
  if (!t) return null;
  const data = snapshot();
  const updated_at = new Date().toISOString();
  await apiFetch("/conta/dados", { method: "PUT", headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify({ data, updated_at }) });
  try {
    localStorage.setItem(SYNCED_KEY, updated_at);
  } catch {}
  return JSON.stringify(data);
}

/**
 * Ao entrar: se o banco tem dados mais novos que a última sincronização deste aparelho, eles substituem os locais
 * (devolve true para a tela recarregar). Se o banco está vazio, sobe o que já existe neste navegador.
 */
export async function pullData(): Promise<boolean> {
  const t = await token();
  if (!t) return false;
  const r = await apiFetch<{ data: Record<string, string>; updated_at: string | null }>("/conta/dados", {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.updated_at || !Object.keys(r.data).length) {
    await pushData();
    return false;
  }
  let synced: string | null = null;
  try {
    synced = localStorage.getItem(SYNCED_KEY);
  } catch {}
  if (synced && new Date(synced) >= new Date(r.updated_at)) return false;
  const local = snapshot();
  // Primeira sincronização deste aparelho: o que só existe aqui (ex.: a carteira) não é apagado; sobe para a conta.
  const keepLocal = !synced ? SYNC_KEYS.filter((k) => r.data[k] == null && local[k] != null) : [];
  const changed = SYNC_KEYS.some((k) => !keepLocal.includes(k) && (r.data[k] ?? null) !== (local[k] ?? null));
  try {
    for (const k of SYNC_KEYS) {
      if (r.data[k] != null) localStorage.setItem(k, r.data[k]);
      else if (!keepLocal.includes(k)) localStorage.removeItem(k);
    }
    localStorage.setItem(SYNCED_KEY, r.updated_at);
  } catch {}
  if (keepLocal.length) await pushData().catch(() => null);
  return changed;
}

export const currentSnapshot = () => JSON.stringify(snapshot());
