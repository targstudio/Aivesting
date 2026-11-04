import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AssetLogo } from "./AssetLogo";
import { Term } from "./Term";
import type { ShortTermAsset, ShortTermSignal } from "@/lib/api";
import { formatBRL, formatNumber, formatRatio } from "@/lib/format";

/** Cartão de um papel nas varreduras (Curto prazo e Baratas): indicadores, notas de 0 a 100 e alertas. */
const SIGNAL_STYLE: Record<ShortTermSignal, string> = {
  barato_subindo: "bg-positive/10 text-positive",
  barato_parado: "bg-accent-bg text-accent-text",
  barato_caindo: "bg-negative/10 text-negative",
  subindo: "bg-track text-text",
  neutro: "bg-track text-muted",
  sem_preco: "bg-track text-muted",
};

const RISK_STYLE = { baixo: "text-positive", medio: "text-accent-text", alto: "text-negative" };

export function money(v: number | null | undefined) {
  if (v == null) return "–";
  if (v >= 1e9) return `R$ ${formatNumber(Math.round(v / 1e8) / 10)} bi`;
  if (v >= 1e6) return `R$ ${formatNumber(Math.round(v / 1e5) / 10)} mi`;
  return `R$ ${formatNumber(Math.round(v / 1e3))} mil`;
}

const times = (v: number | null | undefined) => (v == null ? "–" : `${formatNumber(Math.round(v * 100) / 100)}x`);

function Bar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular font-semibold text-text">{value == null ? "sem dado" : value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: ReactNode; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function ScreenAssetCard({
  a,
  fii,
  position,
  showSignal = true,
}: {
  a: ShortTermAsset;
  fii: boolean;
  position: number;
  /** Selo "barato e ganhando força" etc. e a barra de embalo; a lista de baratas esconde (não depende do preço). */
  showSignal?: boolean;
}) {
  const m = a.momentum;
  return (
    <Link
      href={`/ativo/${a.ticker}`}
      className="block rounded-3xl border border-border bg-surface px-4 py-4 transition-colors hover:bg-track/40 md:px-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="tabular w-7 text-center text-sm font-bold text-muted">{position}º</span>
          <AssetLogo ticker={a.ticker} src={a.logo_url} />
          <span className="min-w-0">
            <span className="block font-bold">{a.ticker}</span>
            <span className="block truncate text-sm text-muted">{fii && a.segment ? a.segment : a.name}</span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {showSignal && <span className={`rounded-full px-2.5 py-1 ${SIGNAL_STYLE[a.signal]}`}>{a.signal_label}</span>}
          <span className={`rounded-full bg-track px-2.5 py-1 ${RISK_STYLE[a.risk]}`}>{a.risk_label}</span>
          <span className="rounded-full bg-primary px-2.5 py-1 text-on-primary">
            Nota {(showSignal ? a.scores.total : a.scores.cheap ?? a.scores.value) ?? "–"}
          </span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 md:grid-cols-6">
        <Metric label="Preço" value={a.price != null ? formatBRL(a.price) : "–"} />
        <Metric
          label={<Term k="pvp">P/VP</Term>}
          value={times(a.p_vp)}
          hint={a.p_vp == null ? undefined : a.p_vp < 1 ? "abaixo do patrimônio" : "acima do patrimônio"}
        />
        {fii ? (
          <Metric label={<Term k="vacancia">Vazios</Term>} value={a.vacancy == null ? "sem dado" : formatRatio(a.vacancy, false)} />
        ) : (
          <Metric label={<Term k="pl">P/L</Term>} value={times(a.p_l)} hint={a.p_l ? (Math.round(a.p_l) <= 1 ? "1 ano de lucro" : `${Math.round(a.p_l)} anos de lucro`) : undefined} />
        )}
        <Metric label={<Term k="dividend_yield">Dividendos</Term>} value={a.dy == null ? "–" : formatRatio(a.dy, false)} hint="últimos 12 meses" />
        <Metric label="No mês" value={m ? formatRatio(m.ret_1m) : "sem dado"} hint={m ? `3 meses: ${formatRatio(m.ret_3m)}` : undefined} />
        <Metric label={<Term k="liquidez">Negociado/dia</Term>} value={money(a.liquidity)} />
      </div>

      <div className={`mt-4 grid gap-4 ${showSignal ? "grid-cols-3" : "grid-cols-2"}`}>
        <Bar label="Desconto" value={a.scores.value} />
        <Bar label={fii ? "Qualidade" : "Saúde"} value={a.scores.quality} />
        {showSignal && <Bar label="Embalo" value={a.scores.momentum} />}
      </div>

      {a.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
          {a.alerts.slice(0, 3).map((t) => (
            <li key={t} className="flex gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-accent-text" />
              {t}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}

