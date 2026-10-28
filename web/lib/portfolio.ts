import { apiFetch, type Holding } from "./api";

// A carteira fica neste navegador e, quando a API tem banco, também no Supabase pelo id aleatório abaixo.
// Os prints nunca são guardados: só as posições que a pessoa conferiu.

export type StoredPortfolio = {
  id: string;
  holdings: Holding[];
  updatedAt: string;
  /** Leitura da IA guardada para não gastar cota a cada visita (vale enquanto a carteira e o nível não mudam). */
  reading?: { key: string; text: string };
};

const KEY = "aivesting.carteira";
export const PORTFOLIO_EVENT = "aivesting:carteira";

export function loadPortfolio(): StoredPortfolio | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.holdings) ? parsed : null;
  } catch {
    return null;
  }
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

/** Grava no navegador e tenta gravar no banco. Devolve se o banco aceitou. */
export async function savePortfolio(holdings: Holding[], current: StoredPortfolio | null): Promise<{ stored: StoredPortfolio; synced: boolean }> {
  const stored: StoredPortfolio = { id: current?.id ?? newId(), holdings, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {}
  window.dispatchEvent(new Event(PORTFOLIO_EVENT));
  try {
    await apiFetch(`/carteira/${stored.id}`, { method: "PUT", body: JSON.stringify({ holdings, updated_at: stored.updatedAt }) });
    return { stored, synced: true };
  } catch {
    return { stored, synced: false };
  }
}

export function saveReading(p: StoredPortfolio, reading: StoredPortfolio["reading"]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, reading }));
  } catch {}
}

/** Traz do banco a versão mais nova (ex.: salva em outra aba ou depois de limpar o cache da leitura). */
export async function syncPortfolio(local: StoredPortfolio): Promise<StoredPortfolio> {
  try {
    const remote = await apiFetch<{ holdings: Holding[]; updated_at: string }>(`/carteira/${local.id}`);
    if (new Date(remote.updated_at) > new Date(local.updatedAt)) {
      const next = { id: local.id, holdings: remote.holdings, updatedAt: remote.updated_at };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    }
  } catch {}
  return local;
}

export async function deletePortfolio(p: StoredPortfolio | null) {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(PORTFOLIO_EVENT));
  if (p) await apiFetch(`/carteira/${p.id}`, { method: "DELETE" }).catch(() => undefined);
}

/** Junta posições novas à carteira: o mesmo ticker (ou nome, na renda fixa) é substituído pela linha nova. */
export function mergeHoldings(current: Holding[], incoming: Holding[]): Holding[] {
  const key = (h: Holding) => (h.ticker ? `t:${h.ticker}` : `n:${h.name.trim().toLowerCase()}`);
  const map = new Map(current.map((h) => [key(h), h]));
  for (const h of incoming) map.set(key(h), h);
  return [...map.values()];
}

/** Reduz o print (lado maior até 2400 px) e devolve como data URL, para caber no limite de 5 MB da IA. */
export async function imageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG mantém os números nítidos; se ficar grande demais, JPEG de alta qualidade.
  const png = canvas.toDataURL("image/png");
  return png.length < 6_500_000 ? png : canvas.toDataURL("image/jpeg", 0.9);
}

export function emptyHolding(): Holding {
  return { ticker: null, name: "", asset_class: "acoes", indexer: null, quantity: null, avg_price: null, price: null, value: null, maturity: null };
}
