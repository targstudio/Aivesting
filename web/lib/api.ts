export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type AssetClass = "acoes" | "fiis";

export type Contribution = {
  factor: string;
  label: string;
  value: number;
  zscore: number;
  contribution: number;
};

export type RankedAsset = {
  ticker: string;
  name: string;
  asset_class: AssetClass;
  price: number;
  change_percent: number;
  rank: number;
  score: number;
  probability_outperform: number;
  top_factors: Contribution[];
  logo_url: string | null;
  /** Últimos fechamentos (até 30 pregões). */
  spark: number[];
};

export type RankingSnapshot = {
  asset_class: AssetClass;
  benchmark: string;
  model_version: string;
  computed_at: string;
  data_realtime: boolean;
  assets: RankedAsset[];
  disclaimer: string;
};

export type MacroIndicator = {
  key: string;
  label: string;
  unit: string;
  value: number;
  date: string;
  previous: number | null;
};

export type AssetDetail = {
  asset: RankedAsset;
  benchmark: string;
  total: number;
  computed_at: string;
  data_realtime: boolean;
  model_version: string;
  disclaimer: string;
};

// O ranking muda a cada 5 minutos no backend; o front revalida a cada minuto.
async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getRanking = (c: AssetClass) => get<RankingSnapshot>(`/ranking/${c}`);
export const getMacro = () => get<{ indicators: MacroIndicator[] }>("/macro");
export const getAsset = (ticker: string) => get<AssetDetail>(`/assets/${encodeURIComponent(ticker)}`);

// ---- Horizontes de 1, 3, 5 e 10 anos (modelo calibrado com histórico mensal desde 2000) ----

export type Horizon = 1 | 3 | 5 | 10;

export type RiskMetrics = {
  months: number;
  total_return: number;
  cagr: number;
  volatility: number;
  max_drawdown: number;
  sharpe: number | null;
  cdi_cagr: number | null;
  worst_12m: number | null;
  best_12m: number | null;
};

export type Validation = {
  oos_samples: number;
  oos_effective?: number;
  brier?: number;
  brier_base_rate?: number;
  skill?: number;
  auc?: number | null;
  hit_rate_top?: number;
  hit_rate_bottom?: number;
  validated: boolean;
};

export type TargetInfo = { base_rate: number | null; effective_windows: number; validation: Validation; coefficients: Record<string, number> | null };

export type WindowStats = {
  windows: number;
  median: number;
  p10: number;
  p90: number;
  beat_cdi_freq: number | null;
  beat_benchmark_freq: number | null;
};

export type HorizonAsset = {
  ticker: string;
  name: string;
  rank: number;
  prob_beat_benchmark: number | null;
  prob_beat_cdi: number | null;
  history: WindowStats | null;
  top_factors: { factor: string; label: string; contribution: number }[];
  sharpe_10y: number | null;
  logo_url?: string | null;
};

export type ScenarioIndicator = {
  label: string;
  unit: string;
  value: number;
  month: string;
  change_12m: number | null;
  return_12m: number | null;
};

export type Scenario = {
  month: string | null;
  key?: string;
  label?: string;
  similar_months?: number;
  indicators: Record<string, ScenarioIndicator>;
};

export type HorizonRanking = {
  years: Horizon;
  months: number;
  asset_class: AssetClass;
  benchmark: string;
  benchmark_is_proxy: boolean;
  model_version: string;
  model_used: boolean;
  enough_history: boolean;
  data_through: string;
  scenario: Scenario;
  beat_benchmark: TargetInfo;
  beat_cdi: TargetInfo;
  assets: HorizonAsset[];
  disclaimer: string;
};

export type CrisisInfo = { key: string; label: string; start: string; end: string; description: string };
export type CrisisResult = { key: string; return: number | null; recovery_months: number | null; recovered: boolean };
export type AnnualReturn = { year: number; return: number; partial: boolean };

export type AssetHistory = {
  ticker: string;
  name: string;
  asset_class: AssetClass;
  first_month: string;
  logo_url: string | null;
  risk_10y: RiskMetrics | null;
  annual: AnnualReturn[];
  crises: CrisisResult[];
  in_scenario: { months: number; avg_annual: number } | null;
  horizons: Record<string, (Omit<HorizonAsset, "ticker" | "name" | "sharpe_10y"> & { total: number }) | null>;
  benchmark: string;
  benchmark_risk: RiskMetrics | null;
  benchmark_annual: AnnualReturn[];
  benchmark_crises: CrisisResult[];
  benchmark_in_scenario: { months: number; avg_annual: number } | null;
  cdi_risk: RiskMetrics | null;
  cdi_annual: AnnualReturn[];
  crisis_list: CrisisInfo[];
  scenario: Scenario;
  model_version: string;
  data_through: string;
  model_used: Record<string, boolean>;
  disclaimer: string;
};

export const HORIZONS: Horizon[] = [1, 3, 5, 10];

export const getHorizon = (c: AssetClass, years: Horizon) => get<HorizonRanking>(`/horizontes/${c}/${years}`);
export const getAssetHistory = (ticker: string) =>
  get<AssetHistory>(`/assets/${encodeURIComponent(ticker)}/historico`);

// ---- Mercado, alertas e IA em cada tela ----

export type MarketItem = {
  symbol: string;
  label: string;
  group: string;
  unit: string;
  value: number;
  change_percent: number;
  spark: number[];
};

export type Mover = Pick<RankedAsset, "ticker" | "name" | "asset_class" | "price" | "change_percent" | "rank" | "logo_url" | "spark">;

export type MarketOverview = {
  indices: MarketItem[];
  atualizado_em: string | null;
  altas: Mover[];
  baixas: Mover[];
  amplitude: { altas: number; baixas: number; estaveis: number };
  pregao_aberto: boolean;
  disclaimer: string;
};

export type Health = {
  status: string;
  provider: string;
  realtime: boolean;
  database: boolean;
  ai: boolean;
  ai_requests_per_hour: number;
  ranking_interval_minutes: number;
  market_open: boolean;
  longterm: boolean;
  advisor: boolean;
};

export type AssetSummary = Pick<RankedAsset, "ticker" | "name" | "asset_class" | "price" | "change_percent" | "rank" | "probability_outperform" | "logo_url">;

export type AlertKind = "preco_acima" | "preco_abaixo" | "alta_dia" | "queda_dia" | "entrou_top" | "prob_acima";

export type AlertResult = {
  id: string;
  ticker: string;
  triggered: boolean;
  available: boolean;
  current: number | null;
  message: string;
};

export type Level = "iniciante" | "intermediario" | "avancado";

export const getMarket = () => get<MarketOverview>("/mercado");

export const API_DOWN_EVENT = "aivesting:api-down";

/** A API não respondeu (dormindo no plano gratuito, reiniciando ou fora do ar). */
export class ApiNetworkError extends Error {
  constructor() {
    super("Não foi possível falar com a API agora. No plano gratuito ela leva até 1 minuto para acordar.");
    this.name = "ApiNetworkError";
  }
}

/** Chamadas feitas no navegador (sem cache do Next), com a mensagem de erro da API. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    // Avisa o indicador do topo, que passa a mostrar a contagem enquanto a API acorda.
    if (typeof window !== "undefined") window.dispatchEvent(new Event(API_DOWN_EVENT));
    throw new ApiNetworkError();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Erro ${res.status}`);
  return body as T;
}

// ---- Modo assessor ----

export type AdvisorQuestion = { key: string; label: string; options: string[] };

export type AdvisorAnswers = {
  objetivo: number;
  prazo: number;
  reacao_queda: number;
  experiencia: number;
  oscilacao: number;
};

export type AdvisorInput = {
  answers: AdvisorAnswers;
  amount: number;
  monthly_contribution: number;
  monthly_expenses: number;
  has_reserve: boolean;
  months?: number;
};

export type AdvisorTerm = "curto" | "medio" | "longo";

export type AdvisorPick = {
  ticker: string;
  name: string;
  logo_url?: string | null;
  probability?: number | null;
  note: string;
  value?: number;
};

export type AdvisorAllocation = {
  key: string;
  label: string;
  value: number;
  pct: number;
  risk: string;
  why: string;
  products: string[];
  picks: Partial<Record<AdvisorTerm, AdvisorPick[]>>;
  suggested: AdvisorPick[];
  suggested_rest: number | null;
};

export type AdvisorPlan = {
  profile: "conservador" | "moderado" | "arrojado";
  score: number;
  months: number | null;
  term: AdvisorTerm;
  term_label: string;
  terms: Record<AdvisorTerm, string>;
  amount: number;
  allocation: AdvisorAllocation[];
  monthly_contribution: { key: string; label: string; value: number }[] | null;
  variable_income_pct: number;
  macro: { selic: number | null; ipca_12m: number | null; juro_real: number | null; cdi_estimado: number | null };
  notes: string[];
  disclaimer: string;
};

// ---- Consumo de IA ----

export type UsageWindow = { calls: number; input_tokens: number; output_tokens: number; cost_usd: number; cost_brl: number | null };

export type AiUsage = {
  today: UsageWindow;
  last_7_days: UsageWindow;
  last_30_days: UsageWindow;
  by_feature_30_days: (UsageWindow & { feature: string; label: string })[];
  daily: { day: string; calls: number; cost_usd: number }[];
  cache_hits_since_start: number;
  since: string;
  since_request: { at: string; cost_usd: number; complete: boolean } | null;
  avg_daily_usd_7_days: number;
  persisted: boolean;
  usd_brl: number | null;
  model: string;
  ai: boolean;
};

// ---- Minha carteira ----

export type HoldingClass = "acoes" | "fiis" | "etf" | "bdr" | "renda_fixa" | "fundos" | "internacional" | "cripto" | "caixa" | "outros";

export const HOLDING_CLASSES: Record<HoldingClass, string> = {
  acoes: "Ações",
  fiis: "FIIs",
  etf: "ETFs",
  bdr: "BDRs",
  renda_fixa: "Renda fixa",
  fundos: "Fundos",
  internacional: "Dólar e exterior",
  cripto: "Cripto",
  caixa: "Saldo em conta",
  outros: "Outros",
};

export type Holding = {
  ticker: string | null;
  name: string;
  asset_class: HoldingClass;
  indexer: "pos" | "ipca" | "pre" | null;
  quantity: number | null;
  avg_price: number | null;
  price: number | null;
  value: number | null;
  maturity: string | null;
};

export type PortfolioRead = {
  broker: string | null;
  holdings: Holding[];
  section_totals: { label: string; value: number }[];
  warnings: string[];
  total: number;
  totals_match: boolean | null;
};

export type PortfolioPosition = {
  ticker: string | null;
  name: string;
  asset_class: HoldingClass;
  class_label: string;
  indexer: string | null;
  maturity: string | null;
  quantity: number | null;
  avg_price: number | null;
  price: number | null;
  price_source: "app" | "print";
  value: number;
  cost: number | null;
  result: number | null;
  result_pct: number | null;
  sector: string | null;
  bucket: string;
  logo_url: string | null;
  weight: number;
  ranking: { rank: number; total: number; probability: number; change_percent: number | null } | null;
  risk_10y: RiskMetrics | null;
};

export type PortfolioGroup = { key: string; label: string; value: number; count: number; pct: number };

export type PortfolioAnalysis = {
  total: number;
  positions: PortfolioPosition[];
  by_class: PortfolioGroup[];
  by_sector: PortfolioGroup[];
  by_bucket: PortfolioGroup[];
  variable_income_pct?: number;
  concentration: {
    positions: number;
    largest: { ticker: string | null; name: string; pct: number };
    top3_pct: number;
    hhi: number;
    effective_positions: number;
  } | null;
  alerts: { kind: string; level: "alto" | "medio" | "baixo"; text: string }[];
  result: { cost: number; value: number; result: number; result_pct: number; covered_pct: number } | null;
  risk: {
    years: number[];
    coverage: number;
    annual: { year: number; return: number; coverage: number }[];
    cagr: number | null;
    volatility_annual: number | null;
    worst_year: { year: number; return: number } | null;
    best_year: { year: number; return: number } | null;
    benchmark: string;
    benchmark_annual: { year: number; return: number }[];
    benchmark_cagr: number | null;
    cdi_annual: { year: number; return: number }[];
    cdi_cagr: number | null;
    crises: { key: string; label: string; start: string; end: string; return: number; benchmark: number | null; coverage: number }[];
    data_through: string;
  } | null;
  plan?: {
    profile: string;
    term_label: string;
    comparison: { key: string; label: string; current_pct: number; target_pct: number; diff_value: number }[];
  };
  disclaimer: string;
};

// ---- Simulador de metas e aportes ----

export type SimulationInput = {
  initial: number;
  monthly: number;
  years: number;
  goal: number | null;
  adjust_contributions: boolean;
};

export type SimulationStrategy = {
  key: string;
  label: string;
  weights: Record<string, number>;
  enough_history: boolean;
  windows?: number;
  worst?: number;
  worst_start?: string;
  p10?: number;
  median?: number;
  p90?: number;
  best?: number;
  best_start?: string;
  invested?: number;
  goal_hit_rate?: number | null;
  needed_monthly_80?: number | null;
};

export type SimulationResult = {
  years: number;
  initial: number;
  monthly: number;
  goal: number | null;
  strategies: SimulationStrategy[];
  components: Record<string, string>;
  first_start: string | null;
  last_start: string | null;
  data_through: string;
  disclaimer: string;
};

// ---- Todos os ativos da B3 (lista do arquivo público de cotações da B3) ----

export type B3Type = "acao" | "fii" | "etf" | "bdr" | "unit";

export type B3Asset = {
  ticker: string;
  name: string;
  type: B3Type;
  type_label: string;
  spec: string;
  /** Fechamento do último pregão. */
  price: number;
  change_percent: number | null;
  volume: number;
  trades: number;
  date: string;
  logo_url: string;
  /** Posição no ranking, quando o ativo faz parte dele. */
  rank?: number;
};

export type B3List = {
  total: number;
  ativos: B3Asset[];
  tipos: { key: B3Type; label: string; total: number }[];
  pregao: string | null;
  fonte: string;
  disclaimer: string;
};

export type B3Quote = {
  ticker: string;
  name: string;
  price: number;
  change_percent: number | null;
  as_of: string | null;
  spark: number[];
  volume: number | null;
  source: string;
  /** false = só o fechamento do último pregão da B3 (provedor indisponível ou sem cota agora). */
  live: boolean;
  type?: B3Type;
  type_label?: string;
  spec?: string;
  logo_url: string;
  rank?: number;
  pregao: string | null;
  disclaimer: string;
};

export const getB3Quote = (ticker: string) => get<B3Quote>(`/b3/ativos/${encodeURIComponent(ticker)}`);

// ---- Proventos (dividendos, JCP e rendimentos) ----

export type AssetDividends = {
  ticker: string;
  price: number | null;
  total_12m: number;
  dy_12m: number | null;
  months_paid_12m: number;
  frequency: string | null;
  payments: { date: string; amount: number }[];
  disclaimer: string;
};

export type DividendYield = { dy_12m: number | null; total_12m: number; frequency: string | null } | null;

export type PortfolioDividends = {
  income_12m: number;
  monthly_avg: number;
  received: { month: string; value: number }[];
  forecast: { month: string; value: number }[];
  assets: {
    ticker: string;
    asset_class?: string;
    quantity: number;
    available: boolean;
    income_12m?: number;
    dy_12m?: number | null;
    frequency?: string | null;
    months?: string[];
  }[];
  ignored: number;
  disclaimer: string;
};

export const getAssetDividends = (ticker: string) => get<AssetDividends>(`/assets/${encodeURIComponent(ticker)}/proventos`);
export const getDividendYields = (tickers: string[]) =>
  tickers.length ? get<Record<string, DividendYield>>(`/proventos?tickers=${tickers.join(",")}`) : Promise.resolve(null);
