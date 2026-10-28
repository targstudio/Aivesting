"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { smoothPath } from "./chartPath";

/** Largura real do contêiner, para o SVG desenhar em pixels (texto sempre no mesmo tamanho). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmt = (v: number, decimals: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/**
 * Gráfico de área com curva suave, grade tracejada e marcador com valor ao passar o mouse (ou tocar).
 * Os rótulos do eixo X são opcionais; sem eles, mostra "há N dias".
 */
export function AreaChart({
  values,
  labels,
  height = 240,
  prefix = "",
  suffix = "",
  decimals = 2,
  color = "var(--chart-2)",
}: {
  values: number[];
  labels?: string[];
  height?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Cor no formato das variáveis do tema, ex.: "var(--chart-1)". */
  color?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth(320);
  if (values.length < 2) return <div style={{ height }} className="flex items-center justify-center text-sm text-muted">Sem dados suficientes.</div>;

  const H = height;
  const pad = { l: 52, r: 12, t: 16, b: 28 };
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(values.length - 1)},${H - pad.b} L${pad.l},${H - pad.b} Z`;
  const tickDecimals = hi - lo < 10 ? Math.min(decimals, 2) : 0;
  const xLabels = labels ?? values.map((_, i) => (i === values.length - 1 ? "hoje" : `-${values.length - 1 - i}d`));
  const every = Math.max(1, Math.round(values.length / Math.max(2, Math.floor(W / 110))));
  const h = hover ?? values.length - 1;
  const change = values[h] / values[0] - 1;
  const tipX = x(h) / W;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block max-w-full touch-none select-none"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (values.length - 1));
          setHover(Math.max(0, Math.min(values.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Gráfico de ${values.length} pontos, de ${prefix}${fmt(values[0], decimals)}${suffix} a ${prefix}${fmt(values[values.length - 1], decimals)}${suffix}`}
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={`rgb(${color})`} stopOpacity={0.45} />
            <stop offset="100%" stopColor={`rgb(${color})`} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--border))" strokeDasharray="4 6" />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {fmt(t, tickDecimals)}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          i % every === 0 || i === values.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === values.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="fill-muted text-[11px]">
              {l}
            </text>
          ) : null,
        )}
        <path d={area} fill={`url(#g${id})`} />
        <path d={line} fill="none" stroke={`rgb(${color})`} strokeWidth={2.25} strokeLinecap="round" />
        <line x1={x(h)} x2={x(h)} y1={y(values[h])} y2={H - pad.b} stroke={`rgb(${color})`} strokeOpacity={0.5} />
        <circle cx={x(h)} cy={y(values[h])} r={6} fill="rgb(var(--text))" stroke="rgb(var(--surface))" strokeWidth={3} />
      </svg>
      <div
        className={`pointer-events-none absolute -translate-y-full rounded-lg bg-surface-2 px-3 py-1.5 text-center text-xs shadow-lg ring-1 ring-border transition-opacity ${
          hover == null ? "opacity-0" : "opacity-100"
        } ${tipX > 0.85 ? "-translate-x-full" : tipX < 0.15 ? "" : "-translate-x-1/2"}`}
        style={{ left: x(h), top: y(values[h]) - 12 }}
      >
        <div className="text-[10px] text-muted">{xLabels[h]}</div>
        <div className="tabular font-bold">
          {prefix}
          {fmt(values[h], decimals)}
          {suffix}
        </div>
        <div className={`tabular ${change >= 0 ? "text-positive" : "text-negative"}`} title="Variação desde o início do gráfico">
          {change >= 0 ? "↑" : "↓"} {fmt(Math.abs(change * 100), 1)}% no período
        </div>
      </div>
    </div>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

/** Rosca com fatias separadas por um pequeno vão, como no restante do painel. */
export function Donut({ slices, size = 180, thickness = 30, center }: { slices: DonutSlice[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--track))" strokeWidth={thickness} />
        {slices.map((s) => {
          const len = (Math.max(0, s.value) / total) * c;
          const el = len > 0 && (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-acc}
            >
              <title>{s.label}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

/** Barras lado a lado (ex.: ativo x índice por ano), com linha do zero quando há valores negativos. */
export function PairedBars({
  groups,
  series,
  height = 220,
  suffix = "%",
}: {
  groups: { label: string; values: (number | null | undefined)[] }[];
  series: { label: string; color: string }[];
  height?: number;
  suffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth(320);
  const all = groups.flatMap((g) => g.values.filter((v): v is number => v != null));
  if (!all.length) return null;
  const H = height;
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / groups.length;
  const bw = Math.min(10, (slot * 0.6) / series.length);
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--border))" strokeDasharray={t === 0 ? undefined : "4 6"} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {fmt(t, 0)}
              {suffix}
            </text>
          </g>
        ))}
        {groups.map((g, i) => {
          const cx = pad.l + slot * (i + 0.5);
          return (
            <g key={g.label} onPointerEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill={hover === i ? "rgb(var(--track) / 0.6)" : "transparent"} rx={6} />
              {g.values.map((v, j) => {
                if (v == null) return null;
                const bx = cx + (j - (series.length - 1) / 2) * (bw + 4) - bw / 2;
                const top = Math.min(y(v), y(0));
                return <rect key={j} x={bx} y={top} width={bw} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={bw / 2} fill={series[j].color} />;
              })}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((s, j) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
            {hover != null && groups[hover].values[j] != null && (
              <strong className="tabular text-text">
                {groups[hover].label}: {fmt(groups[hover].values[j]!, 1)}
                {suffix}
              </strong>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
