import { smoothPath } from "./chartPath";

// Minigráfico de linha suave em SVG: verde-claro se o período fecha em alta, rosado se em queda.
export function Sparkline({ values, width = 96, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ width, height }} className="inline-block" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as [number, number]);
  const up = values[values.length - 1] >= values[0];
  const line = smoothPath(pts);
  const id = `sp${up ? "u" : "d"}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={up ? "text-positive" : "text-negative"} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}
