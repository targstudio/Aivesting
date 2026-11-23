"use client";

import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { AlertTriangle, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/app/components/ui";
import {
  fmtDateTime,
  fmtMoney,
  fmtNum,
  fmtPct,
  getPresets,
  runPreset,
  runStrategy,
  runText,
  type Backtest,
  type Condition,
  type Op,
  type Preset,
  type Strategy,
} from "@/lib/trading";
import { TickerSearch } from "./parts";

const OPS: { key: Op; label: string }[] = [
  { key: "cruza_acima", label: "cruza acima de" },
  { key: "cruza_abaixo", label: "cruza abaixo de" },
  { key: "acima", label: "está acima de" },
  { key: "abaixo", label: "está abaixo de" },
];
const MOTIVOS: Record<string, string> = {
  stop: "Stop",
  alvo: "Alvo",
  "sinal de saída": "Saída",
  "fim do pregão": "Fim do pregão",
  tempo: "Tempo",
  "fim do teste": "Fim do teste",
};

export function StrategyLab({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Backtest | null>(null);
  const [draft, setDraft] = useState<Strategy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPresets().then((r) => setPresets(r.prontas)).catch(() => setPresets([]));
  }, []);

  async function go(fn: () => Promise<Backtest>) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      setResult(r);
      setDraft(r.estrategia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao testar.");
    } finally {
      setBusy(false);
    }
  }

  const m = result?.metricas ?? {};
  return (
    <>
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Descreva a estratégia" subtitle="Em português, do jeito que você opera. A IA transforma em regras." />
          <div className="mb-3 flex items-center gap-3">
            <TickerSearch value={ticker} onPick={setTicker} />
            <span className="text-xs text-muted">ativo padrão do teste</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Ex.: day trade em PETR4 no gráfico de 5 minutos, comprar quando o preço cruzar a VWAP para cima com a MME9 acima da MME21, stop de 0,8% e alvo de 1,5%"
            className="w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-text"
          />
          <button
            disabled={busy || text.trim().length < 5}
            onClick={() => go(() => runText(text, ticker))}
            className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            <Sparkles size={16} /> {busy ? "Testando..." : "Testar com a IA"}
          </button>
        </Card>
        <Card>
          <CardHeader title="Estratégias prontas" subtitle={`Setups clássicos do mercado brasileiro, testados em ${ticker}.`} />
          <div className="grid gap-2 sm:grid-cols-2">
            {presets.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                onClick={() => go(() => runPreset(p.id, ticker))}
                className="rounded-lg border border-border p-3 text-left hover:border-text disabled:opacity-50"
              >
                <span className="block text-sm font-semibold">{p.nome}</span>
                <span className="mt-1 block text-xs text-muted">{p.descricao}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {error && <Card className="mb-6 text-sm text-negative">{error}</Card>}

      {draft && <RulesEditor draft={draft} onChange={setDraft} onRun={() => go(() => runStrategy(draft))} busy={busy} />}

      {result && (
        <>
          {result.explicacao && (
            <Card className="mb-6 text-sm">
              <span className="font-semibold">{result.lido_pela_ia ? "Como a IA entendeu: " : ""}</span>
              {result.explicacao}
            </Card>
          )}
          <Card className="mb-6">
            <CardHeader
              title={`${result.estrategia.nome} · ${result.estrategia.ticker}`}
              subtitle={`${fmtDateTime(result.periodo.inicio, false)} a ${fmtDateTime(result.periodo.fim, false)} · ${result.periodo.candles} candles · ${
                result.estrategia.modalidade === "day_trade" ? "day trade" : "swing trade"
              } · ${result.fonte}`}
            />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
              <Metric label="Retorno líquido" value={fmtPct(m.retorno_pct)} tone={m.retorno_pct} big />
              <Metric label="Depois do IR" value={fmtPct(m.retorno_apos_ir_pct)} tone={m.retorno_apos_ir_pct} />
              <Metric label="Comprar e segurar" value={fmtPct(m.comprar_e_segurar_pct)} tone={m.comprar_e_segurar_pct} />
              <Metric label="Operações" value={fmtNum(m.operacoes, 0)} />
              <Metric label="Taxa de acerto" value={m.taxa_acerto_pct == null ? "–" : `${fmtNum(m.taxa_acerto_pct, 1)}%`} />
              <Metric label="Payoff" value={fmtNum(m.payoff)} />
              <Metric label="Fator de lucro" value={fmtNum(m.fator_lucro)} />
              <Metric label="Maior queda" value={fmtPct(m.maior_queda_pct)} tone={-1} />
              <Metric label="Média por operação" value={fmtMoney(m.expectativa_por_operacao)} tone={m.expectativa_por_operacao} />
              <Metric label="Custos pagos" value={fmtMoney(m.custos_totais)} />
              <Metric label="Imposto estimado" value={fmtMoney(m.imposto_estimado)} />
              <Metric label="Tempo posicionado" value={m.tempo_posicionado_pct == null ? "–" : `${fmtNum(m.tempo_posicionado_pct, 0)}%`} />
            </div>
            {result.avisos.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5">
                {result.avisos.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-accent-text">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="mb-6">
            <CardHeader title="Patrimônio ao longo do teste" subtitle={`Começando com ${fmtMoney(m.capital_inicial)}, já com custos.`} />
            <EquityChart points={result.curva} />
          </Card>
          <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card className="overflow-x-auto !p-0">
              <div className="px-5 pt-5">
                <CardHeader title="Operações" subtitle="As 200 mais recentes." />
              </div>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-y border-border text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Entrada</th>
                    <th className="px-3 py-2 font-medium">Saída</th>
                    <th className="px-3 py-2 text-right font-medium">Preços</th>
                    <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                    <th className="px-3 py-2 font-medium">Motivo</th>
                    <th className="px-4 py-2 text-right font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...result.operacoes].reverse().map((t, i) => {
                    const intraday = result.estrategia.intervalo !== "1d" && result.estrategia.intervalo !== "1wk";
                    return (
                      <tr key={i}>
                        <td className="tabular px-4 py-2">{fmtDateTime(t.entrada, intraday)}</td>
                        <td className="tabular px-3 py-2">{fmtDateTime(t.saida, intraday)}</td>
                        <td className="tabular px-3 py-2 text-right">
                          {fmtNum(t.preco_entrada)} → {fmtNum(t.preco_saida)}
                        </td>
                        <td className="tabular px-3 py-2 text-right">{fmtNum(t.quantidade, 0)}</td>
                        <td className="px-3 py-2">{MOTIVOS[t.motivo] ?? t.motivo}</td>
                        <td className={`tabular px-4 py-2 text-right font-semibold ${t.resultado >= 0 ? "text-positive" : "text-negative"}`}>
                          {fmtMoney(t.resultado)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <Card>
              <CardHeader
                title="Imposto mês a mês"
                subtitle={`${fmtNum(result.imposto.aliquota * 100, 0)}% sobre o lucro, compensando prejuízos${
                  result.estrategia.modalidade === "swing" && !result.estrategia.ticker.endsWith("11") ? ", isento com vendas até R$ 20 mil" : ""
                }.`}
              />
              <ul className="divide-y divide-border text-sm">
                {result.imposto.meses
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((mm) => (
                    <li key={mm.mes} className="flex items-center justify-between py-2">
                      <span>{mm.mes.split("-").reverse().join("/")}</span>
                      <span className={`tabular ${mm.resultado >= 0 ? "text-positive" : "text-negative"}`}>{fmtMoney(mm.resultado)}</span>
                      <span className="tabular w-24 text-right font-semibold">{mm.isento ? "isento" : fmtMoney(mm.imposto)}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Estimativa. Confira com a nota de corretagem e um contador.</p>
            </Card>
          </div>
          <p className="text-xs text-muted">{result.disclaimer}</p>
        </>
      )}
    </>
  );
}

function Metric({ label, value, tone, big = false }: { label: string; value: string; tone?: number | null; big?: boolean }) {
  const color = tone == null ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-1 font-bold ${big ? "text-xl" : "text-base"} ${color}`}>{value}</div>
    </div>
  );
}

function EquityChart({ points }: { points: { t: number; v: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || points.length < 2) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#FFFFFF" }, textColor: "#707070", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "#F2F2F2" } },
      rightPriceScale: { borderColor: "#E4E4E4" },
      timeScale: { borderColor: "#E4E4E4" },
      localization: { locale: "pt-BR", priceFormatter: (p: number) => p.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) },
    });
    const up = points[points.length - 1].v >= points[0].v;
    const s = chart.addSeries(AreaSeries, {
      lineColor: up ? "#008A52" : "#D22D2D",
      topColor: up ? "rgba(0,138,82,0.2)" : "rgba(210,45,45,0.2)",
      bottomColor: "rgba(255,255,255,0)",
      lineWidth: 2,
    });
    const seen = new Set<number>();
    s.setData(
      points
        .filter((p) => (seen.has(p.t) ? false : (seen.add(p.t), true)))
        .map((p) => ({ time: (p.t - 3 * 3600) as UTCTimestamp, value: p.v })),
    );
    s.createPriceLine({ price: points[0].v, color: "#A0A0A0", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "início" });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);
  return <div ref={box} className="h-64 w-full" />;
}

function RulesEditor({ draft, onChange, onRun, busy }: { draft: Strategy; onChange: (s: Strategy) => void; onRun: () => void; busy: boolean }) {
  const set = <K extends keyof Strategy>(k: K, v: Strategy[K]) => onChange({ ...draft, [k]: v });
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const editList = (key: "entrada" | "saida", i: number, c: Partial<Condition> | null) => {
    const list = [...draft[key]];
    if (c === null) list.splice(i, 1);
    else list[i] = { ...list[i], ...c };
    set(key, list);
  };
  return (
    <Card className="mb-6">
      <CardHeader title="Regras" subtitle="Ajuste e teste de novo. Entrada: todas as condições juntas. Saída: qualquer uma." />
      <div className="grid gap-6 lg:grid-cols-2">
        {(["entrada", "saida"] as const).map((key) => (
          <div key={key}>
            <h3 className="mb-2 text-sm font-semibold">{key === "entrada" ? "Entrar quando (E)" : "Sair quando (OU)"}</h3>
            <div className="flex flex-col gap-2">
              {draft[key].map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={c.esquerda}
                    onChange={(e) => editList(key, i, { esquerda: e.target.value })}
                    className="w-28 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  <select
                    value={c.operador}
                    onChange={(e) => editList(key, i, { operador: e.target.value as Op })}
                    className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                  >
                    {OPS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={c.direita}
                    onChange={(e) => editList(key, i, { direita: e.target.value })}
                    className="w-28 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  <button onClick={() => editList(key, i, null)} className="text-muted hover:text-negative" aria-label="Remover">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => set(key, [...draft[key], { esquerda: "preco", operador: "acima", direita: "mme21" }])}
                className="flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-text"
              >
                <Plus size={15} /> condição
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Indicadores: preco, abertura, maxima, minima, volume, mme9, mma200, ifr2, ifr14, macd, macd_sinal, bb_sup20, bb_inf20,
        vwap, atr14, max20 e min20 (das 20 barras anteriores), vol_media20, ou um número.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4 xl:grid-cols-8">
        <Select label="Gráfico" value={draft.intervalo} onChange={(v) => set("intervalo", v as Strategy["intervalo"])}
          options={[["5m", "5 min"], ["15m", "15 min"], ["60m", "60 min"], ["1d", "Diário"], ["1wk", "Semanal"]]} />
        <Select label="Modalidade" value={draft.modalidade} onChange={(v) => set("modalidade", v as Strategy["modalidade"])}
          options={[["day_trade", "Day trade"], ["swing", "Swing"]]} />
        <Select label="Lado" value={draft.lado} onChange={(v) => set("lado", v as Strategy["lado"])} options={[["compra", "Compra"], ["venda", "Venda"]]} />
        <Num label="Stop (%)" value={draft.stop_pct} onChange={(v) => set("stop_pct", numOrNull(v))} />
        <Num label="Stop (x ATR)" value={draft.stop_atr} onChange={(v) => set("stop_atr", numOrNull(v))} />
        <Num label="Alvo (%)" value={draft.alvo_pct} onChange={(v) => set("alvo_pct", numOrNull(v))} />
        <Num label="Capital (R$)" value={draft.capital} onChange={(v) => set("capital", numOrNull(v) ?? 10000)} />
        <Num label="Corretagem/ordem" value={draft.corretagem} onChange={(v) => set("corretagem", numOrNull(v) ?? 0)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Ativo
          <input
            value={draft.ticker}
            onChange={(e) => set("ticker", e.target.value.toUpperCase())}
            className="w-24 rounded-lg border border-border px-2 py-1.5 font-bold uppercase"
          />
        </label>
        <button onClick={onRun} disabled={busy} className="flex items-center gap-2 rounded-lg bg-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Play size={15} /> Testar de novo
        </button>
      </div>
    </Card>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5">
        {options.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number | null; onChange: (v: string) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => setText(value == null ? "" : String(value).replace(".", ",")), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text)}
        inputMode="decimal"
        className="tabular rounded-lg border border-border px-2 py-1.5"
      />
    </label>
  );
}
