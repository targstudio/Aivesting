const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const formatBRL = (v: number) => brl.format(v);
export const formatNumber = (v: number) => num.format(v);
export const formatPercent = (v: number, signed = true) =>
  `${signed && v > 0 ? "+" : ""}${num.format(v)}%`;
export const formatProbability = (p: number | null | undefined) => (p == null ? "–" : `${Math.round(p * 100)}%`);
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
export const changeColor = (v: number) => (v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-muted");
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Fração (0,123) como percentual com uma casa ("+12,3%"). */
export const formatRatio = (v: number | null | undefined, signed = true) =>
  v == null ? "–" : `${signed && v > 0 ? "+" : ""}${pct.format(v * 100)}%`;
/** "2024-08" → "ago/2024". */
export const formatMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${new Date(y, mo - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}/${y}`;
};
