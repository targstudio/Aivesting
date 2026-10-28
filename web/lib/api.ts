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
