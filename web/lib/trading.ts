import { apiFetch } from "./api";

// Módulo de trading: candles, indicadores, radar de setups, teste de estratégia e diário de trades.

export type Interval = "1m" | "5m" | "15m" | "60m" | "1d" | "1wk";
export const INTERVALS: { key: Interval; label: string; short: string }[] = [
  { key: "1m", label: "1 minuto", short: "1m" },
  { key: "5m", label: "5 minutos", short: "5m" },
  { key: "15m", label: "15 minutos", short: "15m" },
  { key: "60m", label: "60 minutos", short: "60m" },
  { key: "1d", label: "Diário", short: "D" },
  { key: "1wk", label: "Semanal", short: "S" },
];

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Setup = { key: string; label: string; direction: "alta" | "baixa" | "neutro"; detail?: string };
export type Phase = { fase: string; label: string; agora: string; aberto: boolean };

export type Analysis = {
  ticker: string;
  name: string | null;
  price: number;
  change_percent: number | null;
  trend: { label: string; score: number; mme21: number | null; mma50: number | null; mma200: number | null };
  indicators: Record<string, number | null>;
  setups: Setup[];
  levels: Record<string, number | null>;
};

export type CandleData = {
  ticker: string;
  name: string;
  interval: Interval;
  interval_label: string;
  intraday: boolean;
  price: number;
  previous_close: number | null;
  as_of: string | null;
  source: string;
  realtime: boolean;
  candles: Candle[];
  series: Record<string, (number | null)[]>;
  analysis: Analysis;
  pregao: Phase;
  disclaimer: string;
};

export type RadarRow = {
  ticker: string;
  name: string;
  price: number;
  change_percent: number | null;
  trend: string;
  ifr14: number | null;
  ifr2: number | null;
  atr_pct: number | null;
  volume_financeiro: number | null;
  volume_relativo: number | null;
  gap_pct: number;
  setups: Setup[];
  spark: number[];
};
export type RadarView = "setups" | "alta" | "baixa" | "day_trade";
export type Radar = {
  updated_at: string;
  visao: RadarView;
  varridos: number;
  contagem_setups: (Setup & { total: number })[];
  ativos: RadarRow[];
  fonte: string;
  aviso: string;
  pregao: Phase;
};

export type Op = "cruza_acima" | "cruza_abaixo" | "acima" | "abaixo";
export type Condition = { esquerda: string; operador: Op; direita: string };
export type Strategy = {
  nome: string;
  ticker: string;
  intervalo: "5m" | "15m" | "60m" | "1d" | "1wk";
  lado: "compra" | "venda";
  modalidade: "day_trade" | "swing";
  entrada: Condition[];
  saida: Condition[];
  stop_pct: number | null;
  alvo_pct: number | null;
  stop_atr: number | null;
  max_barras: number | null;
  capital: number;
  corretagem: number;
  taxa_b3_pct: number | null;
  slippage_pct: number;
};
export type Preset = { id: string; nome: string; descricao: string };
export type BacktestTrade = {
  entrada: number;
  saida: number;
  preco_entrada: number;
  preco_saida: number;
  quantidade: number;
  resultado: number;
  resultado_pct: number;
  custos: number;
  barras: number;
  motivo: string;
};
export type Backtest = {
  estrategia: Strategy;
  regras: { entrada: string[]; saida: string[] };
  periodo: { inicio: number; fim: number; candles: number };
  metricas: Record<string, number | null>;
  imposto: { aliquota: number; total: number; prejuizo_a_compensar: number; meses: { mes: string; resultado: number; vendas: number; isento: boolean; imposto: number }[] };
  curva: { t: number; v: number }[];
  operacoes: BacktestTrade[];
  avisos: string[];
  fonte: string;
  disclaimer: string;
  explicacao?: string;
  lido_pela_ia?: boolean;
};

export type JournalTrade = {
  id: string;
  data: string;
  ticker: string;
  lado: "compra" | "venda";
  modalidade: "day_trade" | "swing";
  quantidade: number;
  preco_entrada: number;
  preco_saida: number | null;
  data_saida: string | null;
  custos: number;
  setup: string;
  nota: string;
};
export type GroupStats = {
  operacoes: number;
  resultado: number;
  taxa_acerto_pct: number | null;
  ganho_medio: number | null;
  perda_media: number | null;
  payoff: number | null;
  fator_lucro: number | null;
  expectativa: number | null;
};
export type JournalSummary = {
  geral: GroupStats;
  abertas: number;
  maior_queda: number;
  maior_sequencia_perdas: number;
  melhor: { ticker: string; data: string; resultado: number } | null;
  pior: { ticker: string; data: string; resultado: number } | null;
  por_setup: Record<string, GroupStats>;
  por_ativo: Record<string, GroupStats>;
  por_modalidade: Record<string, GroupStats>;
  por_dia_semana: Record<string, GroupStats>;
  curva: { data: string; acumulado: number }[];
  imposto: {
    mes: string;
    day_trade: number;
    swing_acoes: number;
    swing_fiis: number;
    vendas_acoes: number;
    isento_swing_acoes: boolean;
    imposto: number;
    irrf_retido: number;
    darf: number;
  }[];
  observacoes: string[];
};

export const getCandles = (ticker: string, interval: Interval) =>
  apiFetch<CandleData>(`/trading/candles/${encodeURIComponent(ticker)}?intervalo=${interval}`);
export const getPresets = () => apiFetch<{ prontas: Preset[]; series: string }>("/trading/estrategias");
export const runPreset = (preset: string, ticker: string) =>
  apiFetch<Backtest>("/trading/backtest/pronta", { method: "POST", body: JSON.stringify({ preset, ticker }) });
export const runText = (texto: string, ticker: string) =>
  apiFetch<Backtest>("/trading/backtest/texto", { method: "POST", body: JSON.stringify({ texto, ticker }) });
export const runStrategy = (s: Strategy) => apiFetch<Backtest>("/trading/backtest", { method: "POST", body: JSON.stringify(s) });
export const summarizeJournal = (trades: JournalTrade[]) =>
  apiFetch<JournalSummary>("/trading/diario/resumo", { method: "POST", body: JSON.stringify({ trades }) });
export const readNotes = (images: string[]) =>
  apiFetch<{ operacoes: Omit<JournalTrade, "id" | "setup" | "nota">[]; observacao: string }>("/trading/diario/ler", {
    method: "POST",
    body: JSON.stringify({ images }),
  });

// Lista de acompanhamento e diário ficam no navegador e são espelhados na conta (ver lib/account.ts).
export const WATCHLIST_KEY = "aivesting.trading.lista";
export const JOURNAL_KEY = "aivesting.trading.diario";

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Brasília não tem horário de verão desde 2019: o gráfico mostra a hora local deslocando 3 horas. */
export const BRT_OFFSET = -3 * 3600;

export const fmtMoney = (v: number | null | undefined) =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtNum = (v: number | null | undefined, d = 2) =>
  v == null ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (v: number | null | undefined, d = 2, signed = true) =>
  v == null ? "–" : `${signed && v > 0 ? "+" : ""}${fmtNum(v, d)}%`;
export const fmtBig = (v: number | null | undefined) => {
  if (v == null) return "–";
  if (v >= 1e9) return `R$ ${fmtNum(v / 1e9, 1)} bi`;
  if (v >= 1e6) return `R$ ${fmtNum(v / 1e6, 1)} mi`;
  if (v >= 1e3) return `R$ ${fmtNum(v / 1e3, 0)} mil`;
  return fmtMoney(v);
};
export const fmtDateTime = (t: number, intraday = true) =>
  new Date(t * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: intraday ? undefined : "2-digit",
    hour: intraday ? "2-digit" : undefined,
    minute: intraday ? "2-digit" : undefined,
  });
