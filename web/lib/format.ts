const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const formatBRL = (v: number) => brl.format(v);
export const formatNumber = (v: number) => num.format(v);
export const formatPercent = (v: number, signed = true) =>
  `${signed && v > 0 ? "+" : ""}${num.format(v)}%`;
export const formatProbability = (p: number) => `${Math.round(p * 100)}%`;
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
export const changeColor = (v: number) => (v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-muted");
