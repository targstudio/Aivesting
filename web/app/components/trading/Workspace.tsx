"use client";

import { RefreshCw, Sparkles, Star, StarOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/components/AppProvider";
import { Card } from "@/app/components/ui";
import {
  fmtMoney,
  fmtNum,
  fmtPct,
  getCandles,
  INTERVALS,
  loadJSON,
  saveJSON,
  WATCHLIST_KEY,
  type CandleData,
  type Interval,
} from "@/lib/trading";
import { CandleChart, OVERLAY_COLORS, type Level, type LowerPane, type Overlay } from "./CandleChart";
import { PhaseBadge, SetupBadge, TickerSearch } from "./parts";
import { PositionSizer } from "./PositionSizer";

const OVERLAYS: { key: Overlay; label: string }[] = [
  { key: "mme9", label: "MME 9" },
  { key: "mme21", label: "MME 21" },
  { key: "mma50", label: "MMA 50" },
  { key: "mma200", label: "MMA 200" },
  { key: "vwap", label: "VWAP" },
  { key: "bollinger", label: "Bollinger" },
];
const LOWER: { key: LowerPane; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "ifr", label: "IFR" },
  { key: "macd", label: "MACD" },
];
const DEFAULT_LIST = ["PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "B3SA3", "WEGE3", "PRIO3"];

export function Workspace({ initialTicker, initialInterval }: { initialTicker: string; initialInterval: Interval }) {
  const router = useRouter();
  const { askAI } = useApp();
  const [ticker, setTicker] = useState(initialTicker);
  const [interval, setInterval_] = useState<Interval>(initialInterval);
  const [data, setData] = useState<CandleData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overlays, setOverlays] = useState<Overlay[]>(["mme9", "mme21", "vwap"]);
  const [lower, setLower] = useState<LowerPane>("volume");
  const [showPivots, setShowPivots] = useState(true);
  const [list, setList] = useState<string[]>(DEFAULT_LIST);

  useEffect(() => setList(loadJSON(WATCHLIST_KEY, DEFAULT_LIST)), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getCandles(ticker, interval));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o gráfico.");
    } finally {
      setLoading(false);
    }
  }, [ticker, interval]);

  useEffect(() => {
    load();
    router.replace(`/trading?ticker=${ticker}&intervalo=${interval}`, { scroll: false });
  }, [load, router, ticker, interval]);

  // Intradiário com o pregão aberto: atualiza sozinho a cada minuto.
  useEffect(() => {
    if (!data?.intraday || !data.pregao.aberto) return;
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [data?.intraday, data?.pregao.aberto, load]);

  const levels = useMemo<Level[]>(() => {
    if (!data || !showPivots) return [];
    const l = data.analysis.levels;
    const out: Level[] = [];
    if (data.intraday) {
      for (const [k, color] of [["pivo_R1", "#D22D2D"], ["pivo_PP", "#707070"], ["pivo_S1", "#008A52"]] as const) {
        if (l[k] != null) out.push({ price: l[k]!, label: k.replace("pivo_", ""), color });
      }
    } else {
      if (l.resistencia_20 != null) out.push({ price: l.resistencia_20, label: "Resist. 20", color: "#D22D2D" });
      if (l.suporte_20 != null) out.push({ price: l.suporte_20, label: "Suporte 20", color: "#008A52" });
    }
    return out;
  }, [data, showPivots]);

  const inList = list.includes(ticker);
  function toggleList() {
    const next = inList ? list.filter((t) => t !== ticker) : [ticker, ...list].slice(0, 30);
    setList(next);
    saveJSON(WATCHLIST_KEY, next);
  }

  const a = data?.analysis;
  const ind = a?.indicators ?? {};
  const change = a?.change_percent ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <Card className="mb-4 !p-4">
          <div className="flex flex-wrap items-center gap-3">
            <TickerSearch value={ticker} onPick={(t) => setTicker(t)} />
            <button
              onClick={toggleList}
              title={inList ? "Tirar da lista" : "Pôr na lista"}
              className="rounded-lg border border-border p-2 text-muted hover:text-text"
            >
              {inList ? <Star size={18} className="fill-primary text-primary" /> : <StarOff size={18} />}
            </button>
            <div className="inline-flex gap-1 rounded-xl border border-border bg-surface-2 p-1 text-sm">
              {INTERVALS.map((i) => (
                <button
                  key={i.key}
                  title={i.label}
                  onClick={() => setInterval_(i.key)}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${interval === i.key ? "bg-primary text-on-primary" : "text-muted hover:text-text"}`}
                >
                  {i.short}
                </button>
              ))}
            </div>
            <button onClick={load} className="ml-auto flex items-center gap-1.5 text-sm text-muted hover:text-text">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
          {data && a && (
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <div className="text-sm text-muted">{data.name}</div>
                <div className="flex items-baseline gap-3">
                  <span className="tabular text-3xl font-bold">{fmtMoney(a.price)}</span>
                  <span className={`tabular font-semibold ${change == null ? "text-muted" : change >= 0 ? "text-positive" : "text-negative"}`}>
                    {fmtPct(change)}
                  </span>
                </div>
              </div>
              <PhaseBadge phase={data.pregao} />
              <span className="text-xs text-muted">{data.source}</span>
            </div>
          )}
        </Card>

        <Card className="!p-3 md:!p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {OVERLAYS.filter((o) => o.key !== "vwap" || data?.intraday).map((o) => {
              const on = overlays.includes(o.key);
              return (
                <button
                  key={o.key}
                  onClick={() => setOverlays(on ? overlays.filter((x) => x !== o.key) : [...overlays, o.key])}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${on ? "border-text text-text" : "border-border text-muted"}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: OVERLAY_COLORS[o.key] }} />
                  {o.label}
                </button>
              );
            })}
            <button
              onClick={() => setShowPivots(!showPivots)}
              className={`rounded-full border px-3 py-1 font-semibold ${showPivots ? "border-text text-text" : "border-border text-muted"}`}
            >
              {data?.intraday ? "Pivôs" : "Suporte e resistência"}
            </button>
            <span className="mx-1 h-4 w-px bg-border" />
            {LOWER.map((l) => (
              <button
                key={l.key}
                onClick={() => setLower(l.key)}
                className={`rounded-full px-3 py-1 font-semibold ${lower === l.key ? "bg-text text-white" : "text-muted hover:text-text"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          {error && <p className="py-20 text-center text-sm text-negative">{error}</p>}
          {!error && !data && <div className="h-[520px] animate-pulse rounded-lg bg-surface-2" />}
          {!error && data && (
            <CandleChart
              candles={data.candles}
              series={data.series}
              intraday={data.intraday}
              overlays={overlays}
              lower={lower}
              levels={levels}
              height={520}
            />
          )}
          {data && (
            <p className="mt-2 text-xs text-muted">
              {data.interval_label} · horário de Brasília · {data.candles.length} candles. {data.disclaimer}
            </p>
          )}
        </Card>

        <div className="mt-4 flex flex-wrap gap-2">
          {list.map((t) => (
            <button
              key={t}
              onClick={() => setTicker(t)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${t === ticker ? "border-primary bg-accent-bg text-accent-text" : "border-border bg-surface text-muted hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="!p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Leitura técnica</h2>
            {a && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  a.trend.label === "Alta" ? "bg-positive/10 text-positive" : a.trend.label === "Baixa" ? "bg-negative/10 text-negative" : "bg-surface-2 text-muted"
                }`}
              >
                Tendência: {a.trend.label}
              </span>
            )}
          </div>
          {a ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row k="IFR 14" v={fmtNum(ind.ifr14, 1)} warn={ind.ifr14 != null && (ind.ifr14 > 70 || ind.ifr14 < 30)} />
                <Row k="IFR 2" v={fmtNum(ind.ifr2, 1)} warn={ind.ifr2 != null && (ind.ifr2 > 90 || ind.ifr2 < 10)} />
                <Row k="MACD" v={fmtNum(ind.macd, 3)} />
                <Row k="Sinal" v={fmtNum(ind.macd_sinal, 3)} />
                <Row k="ATR 14" v={`${fmtNum(ind.atr14)} (${fmtNum(ind.atr_pct)}%)`} />
                <Row k="Estocástico" v={`${fmtNum(ind.estocastico_k, 0)} / ${fmtNum(ind.estocastico_d, 0)}`} />
                <Row k="Vol. relativo" v={ind.volume_relativo != null ? `${fmtNum(ind.volume_relativo, 1)}x` : "–"} warn={(ind.volume_relativo ?? 0) > 2} />
                <Row k="MMA 200" v={fmtNum(a.trend.mma200)} />
              </dl>
              <h3 className="mb-2 mt-4 text-sm font-semibold">Setups no último candle</h3>
              {a.setups.length ? (
                <ul className="flex flex-col gap-2">
                  {a.setups.map((s) => (
                    <li key={s.key} className="text-sm">
                      <SetupBadge setup={s} />
                      <p className="mt-1 text-xs text-muted">{s.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nenhum setup clássico neste candle.</p>
              )}
              <h3 className="mb-2 mt-4 text-sm font-semibold">Níveis</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {Object.entries(a.levels)
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => (
                    <Row key={k} k={LEVEL_LABELS[k] ?? k} v={fmtNum(v)} />
                  ))}
              </dl>
              <button
                onClick={() =>
                  askAI({
                    prompt: `Faça a leitura técnica de ${ticker} no gráfico de ${data?.interval_label.toLowerCase()}: tendência, setups, suportes, resistências e onde ficaria um stop técnico.`,
                  })
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
              >
                <Sparkles size={16} /> Leitura da IA
              </button>
              <Link
                href={`/trading/estrategias?ticker=${ticker}`}
                className="mt-2 block text-center text-sm font-semibold text-muted hover:text-text"
              >
                Testar uma estratégia em {ticker}
              </Link>
            </>
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-surface-2" />
          )}
        </Card>
        <PositionSizer price={a?.price} stop={a?.levels.stop_compra_atr ?? undefined} />
      </div>
    </div>
  );
}

const LEVEL_LABELS: Record<string, string> = {
  resistencia_20: "Resistência 20",
  suporte_20: "Suporte 20",
  stop_compra_atr: "Stop compra (1,5 ATR)",
  stop_venda_atr: "Stop venda (1,5 ATR)",
  pivo_R2: "Pivô R2",
  pivo_R1: "Pivô R1",
  pivo_PP: "Pivô PP",
  pivo_S1: "Pivô S1",
  pivo_S2: "Pivô S2",
  vwap: "VWAP",
};

function Row({ k, v, warn = false }: { k: string; v: string; warn?: boolean }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className={`tabular text-right font-semibold ${warn ? "text-accent-text" : ""}`}>{v}</dd>
    </>
  );
}
