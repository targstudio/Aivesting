"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { BRT_OFFSET, type Candle } from "@/lib/trading";

// Gráfico de candles com a biblioteca lightweight-charts (TradingView, licença Apache 2.0).

export type Overlay = "mme9" | "mme21" | "mma50" | "mma200" | "vwap" | "bollinger";
export type LowerPane = "volume" | "ifr" | "macd" | "none";
export type Level = { price: number; label: string; color: string };
export type Marker = { t: number; kind: "buy" | "sell" | "exit"; text?: string };

export const OVERLAY_COLORS: Record<Overlay, string> = {
  mme9: "#E6AC00",
  mme21: "#5468C4",
  mma50: "#8E44AD",
  mma200: "#1C1C1C",
  vwap: "#D35400",
  bollinger: "#7F8C8D",
};

const UP = "#008A52";
const DOWN = "#D22D2D";

const toTime = (t: number, intraday: boolean) => ((intraday ? t + BRT_OFFSET : t) as UTCTimestamp);

function line(values: (number | null)[], candles: Candle[], intraday: boolean) {
  const out: { time: Time; value: number }[] = [];
  values.forEach((v, i) => {
    if (v != null && candles[i]) out.push({ time: toTime(candles[i].t, intraday), value: v });
  });
  return out;
}

export function CandleChart({
  candles,
  series = {},
  intraday,
  overlays = [],
  lower = "volume",
  levels = [],
  markers = [],
  mode = "candle",
  height = 460,
}: {
  candles: Candle[];
  series?: Record<string, (number | null)[]>;
  intraday: boolean;
  overlays?: Overlay[];
  lower?: LowerPane;
  levels?: Level[];
  markers?: Marker[];
  mode?: "candle" | "area";
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!box.current || candles.length === 0) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#FFFFFF" },
        textColor: "#707070",
        fontSize: 11,
        attributionLogo: true,
        panes: { separatorColor: "#E4E4E4", enableResize: true },
      },
      grid: { vertLines: { color: "#F2F2F2" }, horzLines: { color: "#F2F2F2" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#E4E4E4" },
      timeScale: { borderColor: "#E4E4E4", timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
      localization: {
        locale: "pt-BR",
        priceFormatter: (p: number) => p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      },
    });
    chartRef.current = chart;

    const main =
      mode === "candle"
        ? chart.addSeries(CandlestickSeries, {
            upColor: UP,
            downColor: DOWN,
            borderVisible: false,
            wickUpColor: UP,
            wickDownColor: DOWN,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: "#3C3C3C",
            topColor: "rgba(60,60,60,0.18)",
            bottomColor: "rgba(60,60,60,0.01)",
            lineWidth: 2,
          });
    if (mode === "candle") {
      main.setData(candles.map((c) => ({ time: toTime(c.t, intraday), open: c.o, high: c.h, low: c.l, close: c.c })));
    } else {
      main.setData(candles.map((c) => ({ time: toTime(c.t, intraday), value: c.c })));
    }

    for (const o of overlays) {
      const keys = o === "bollinger" ? ["bb_sup", "bb_meio", "bb_inf"] : [o];
      for (const k of keys) {
        if (!series[k]) continue;
        const s = chart.addSeries(LineSeries, {
          color: OVERLAY_COLORS[o],
          lineWidth: k === "bb_meio" ? 1 : o === "mma200" ? 2 : 1,
          lineStyle: o === "bollinger" && k !== "bb_meio" ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(line(series[k], candles, intraday));
      }
    }

    for (const lv of levels) {
      main.createPriceLine({
        price: lv.price,
        color: lv.color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: lv.label,
      });
    }

    if (markers.length) {
      const ms: SeriesMarker<Time>[] = markers
        .map((m) => ({
          time: toTime(m.t, intraday),
          position: m.kind === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: m.kind === "buy" ? UP : m.kind === "sell" ? DOWN : "#3C3C3C",
          shape: m.kind === "buy" ? ("arrowUp" as const) : m.kind === "sell" ? ("arrowDown" as const) : ("circle" as const),
          text: m.text,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(main, ms);
    }

    if (lower === "volume") {
      const vol = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: {
            type: "custom",
            minMove: 1,
            formatter: (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v))),
          },
          priceLineVisible: false,
          lastValueVisible: false,
        },
        1,
      );
      vol.setData(
        candles.map((c) => ({ time: toTime(c.t, intraday), value: c.v, color: c.c >= c.o ? "rgba(0,138,82,0.45)" : "rgba(210,45,45,0.45)" })),
      );
    } else if (lower === "ifr" && series.ifr14) {
      const r = chart.addSeries(LineSeries, { color: "#5468C4", lineWidth: 2, priceLineVisible: false }, 1);
      r.setData(line(series.ifr14, candles, intraday));
      r.createPriceLine({ price: 70, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "70" });
      r.createPriceLine({ price: 30, color: UP, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "30" });
    } else if (lower === "macd" && series.macd) {
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
      h.setData(
        (series.macd_hist ?? [])
          .map((v, i) => (v == null ? null : { time: toTime(candles[i].t, intraday), value: v, color: v >= 0 ? "rgba(0,138,82,0.5)" : "rgba(210,45,45,0.5)" }))
          .filter((x): x is { time: UTCTimestamp; value: number; color: string } => x != null),
      );
      const m = chart.addSeries(LineSeries, { color: "#3C3C3C", lineWidth: 1, priceLineVisible: false }, 1);
      m.setData(line(series.macd, candles, intraday));
      const s = chart.addSeries(LineSeries, { color: "#E6AC00", lineWidth: 1, priceLineVisible: false }, 1);
      s.setData(line(series.macd_sinal ?? [], candles, intraday));
    }
    if (lower !== "none") {
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(Math.round(height * 0.24));
    }

    // Mostra os últimos ~120 candles; a pessoa arrasta para ver o resto.
    const visible = Math.min(candles.length, intraday ? 150 : 180);
    chart.timeScale().setVisibleLogicalRange({ from: candles.length - visible, to: candles.length + 3 });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, series, intraday, overlays, lower, levels, markers, mode, height]);

  return <div ref={box} style={{ height }} className="w-full" />;
}
