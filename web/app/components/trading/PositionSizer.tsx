"use client";

import { useEffect, useState } from "react";
import { Card } from "@/app/components/ui";
import { fmtMoney, fmtNum, loadJSON, saveJSON } from "@/lib/trading";

const KEY = "aivesting.trading.risco";
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const str = (v: number | undefined) => (v == null ? "" : v.toFixed(2).replace(".", ","));

/** Calculadora de posição: quanto comprar para perder no máximo X% do capital se o stop for atingido. */
export function PositionSizer({ price, stop }: { price?: number; stop?: number }) {
  const [capital, setCapital] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stopV, setStopV] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    const saved = loadJSON<{ capital?: string; risk?: string }>(KEY, {});
    if (saved.capital) setCapital(saved.capital);
    if (saved.risk) setRiskPct(saved.risk);
  }, []);
  useEffect(() => saveJSON(KEY, { capital, risk: riskPct }), [capital, riskPct]);
  useEffect(() => {
    setEntry(str(price));
    setStopV(str(stop));
    setTarget(price && stop ? str(price + 2 * (price - stop)) : "");
  }, [price, stop]);

  const cap = num(capital), risk = num(riskPct) / 100, e = num(entry), s = num(stopV), t = num(target);
  const perShare = Math.abs(e - s);
  const valid = cap > 0 && risk > 0 && e > 0 && s > 0 && perShare > 0;
  let qty = valid ? Math.floor((cap * risk) / perShare) : 0;
  qty = Math.min(qty, Math.floor(cap / (e || 1)));
  const lots = qty >= 100 ? Math.floor(qty / 100) * 100 : qty;
  const rr = valid && t > 0 ? Math.abs(t - e) / perShare : null;

  return (
    <Card className="!p-4">
      <h2 className="font-semibold">Tamanho da posição</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">Quantas ações para perder no máximo o risco escolhido se o stop for atingido.</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Capital (R$)" value={capital} onChange={setCapital} />
        <Field label="Risco por operação (%)" value={riskPct} onChange={setRiskPct} />
        <Field label="Entrada" value={entry} onChange={setEntry} />
        <Field label="Stop" value={stopV} onChange={setStopV} />
        <Field label="Alvo" value={target} onChange={setTarget} />
      </div>
      <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
        {valid ? (
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-muted">Quantidade</dt>
            <dd className="tabular text-right font-bold">{fmtNum(lots, 0)} {lots >= 100 ? "(lote)" : "(fracionário)"}</dd>
            <dt className="text-muted">Valor da posição</dt>
            <dd className="tabular text-right font-semibold">{fmtMoney(lots * e)}</dd>
            <dt className="text-muted">Perda no stop</dt>
            <dd className="tabular text-right font-semibold text-negative">{fmtMoney(lots * perShare)}</dd>
            <dt className="text-muted">Risco/retorno</dt>
            <dd className="tabular text-right font-semibold">{rr ? `1 : ${fmtNum(rr, 1)}` : "–"}</dd>
          </dl>
        ) : (
          <p className="text-muted">Preencha entrada e stop.</p>
        )}
      </div>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="tabular rounded-lg border border-border bg-surface px-2.5 py-1.5 outline-none focus:border-text"
      />
    </label>
  );
}
