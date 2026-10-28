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
