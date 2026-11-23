"use client";

import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/app/components/ui";
import {
  fmtMoney,
  fmtNum,
  JOURNAL_KEY,
  loadJSON,
  readNotes,
  saveJSON,
  summarizeJournal,
  type GroupStats,
  type JournalSummary,
  type JournalTrade,
} from "@/lib/trading";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const blank = (): Omit<JournalTrade, "id"> => ({
  data: today(),
  ticker: "",
  lado: "compra",
  modalidade: "day_trade",
  quantidade: 100,
  preco_entrada: 0,
  preco_saida: null,
  data_saida: null,
  custos: 0,
  setup: "",
  nota: "",
});
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const result = (t: JournalTrade) =>
  t.preco_saida == null ? null : (t.lado === "compra" ? 1 : -1) * (t.preco_saida - t.preco_entrada) * t.quantidade - t.custos;

function fileToDataUrl(f: File) {
  return new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = fail;
    r.readAsDataURL(f);
  });
}

export function Journal() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [form, setForm] = useState(blank());
  const [text, setText] = useState({ quantidade: "100", entrada: "", saida: "", custos: "0" });
  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => setTrades(loadJSON<JournalTrade[]>(JOURNAL_KEY, [])), []);
  useEffect(() => {
    if (!trades.length) return setSummary(null);
    const id = window.setTimeout(() => summarizeJournal(trades).then(setSummary).catch(() => setSummary(null)), 250);
    return () => window.clearTimeout(id);
  }, [trades]);

  function save(next: JournalTrade[]) {
    setTrades(next);
    saveJSON(JOURNAL_KEY, next);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t: JournalTrade = {
      ...form,
      id: crypto.randomUUID(),
      ticker: form.ticker.toUpperCase().trim(),
      quantidade: num(text.quantidade),
      preco_entrada: num(text.entrada),
      preco_saida: text.saida.trim() ? num(text.saida) : null,
      custos: num(text.custos) || 0,
      data_saida: form.modalidade === "day_trade" ? form.data : form.data_saida,
    };
    if (!/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(t.ticker)) return setError("Ticker inválido.");
    if (!(t.quantidade > 0) || !(t.preco_entrada > 0)) return setError("Preencha quantidade e preço de entrada.");
    setError("");
    save([t, ...trades]);
    setText({ ...text, entrada: "", saida: "" });
  }

  async function importNotes(files: FileList | null) {
    if (!files?.length) return;
    setReading(true);
    setNote("");
    try {
      const images = await Promise.all([...files].slice(0, 6).map(fileToDataUrl));
      const r = await readNotes(images);
      const read: JournalTrade[] = r.operacoes.map((o) => ({
        ...o,
        id: crypto.randomUUID(),
        custos: o.custos ?? 0,
        setup: "",
        nota: "importada da nota",
      }));
      save([...read, ...trades]);
      setNote(`${read.length} operações importadas. Confira os números e preencha o setup de cada uma. ${r.observacao}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não consegui ler a nota.");
    } finally {
      setReading(false);
    }
  }

  const setups = useMemo(() => [...new Set(trades.map((t) => t.setup).filter(Boolean))], [trades]);
  const g = summary?.geral;

  return (
    <>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Nova operação" subtitle="Deixe a saída em branco se a posição ainda está aberta." />
          <form onSubmit={add} className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <F label="Data">
              <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={input} />
            </F>
            <F label="Ativo">
              <input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} placeholder="PETR4" className={`${input} font-bold uppercase`} />
            </F>
            <F label="Modalidade">
              <select value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value as JournalTrade["modalidade"] })} className={input}>
                <option value="day_trade">Day trade</option>
                <option value="swing">Swing trade</option>
              </select>
            </F>
            <F label="Lado">
              <select value={form.lado} onChange={(e) => setForm({ ...form, lado: e.target.value as JournalTrade["lado"] })} className={input}>
                <option value="compra">Compra</option>
                <option value="venda">Venda (vendido)</option>
              </select>
            </F>
            <F label="Quantidade">
              <input value={text.quantidade} onChange={(e) => setText({ ...text, quantidade: e.target.value })} inputMode="numeric" className={input} />
            </F>
            <F label="Preço de entrada">
              <input value={text.entrada} onChange={(e) => setText({ ...text, entrada: e.target.value })} inputMode="decimal" className={input} />
            </F>
            <F label="Preço de saída">
              <input value={text.saida} onChange={(e) => setText({ ...text, saida: e.target.value })} inputMode="decimal" className={input} />
            </F>
            <F label="Custos (R$)">
              <input value={text.custos} onChange={(e) => setText({ ...text, custos: e.target.value })} inputMode="decimal" className={input} />
            </F>
            {form.modalidade === "swing" && (
              <F label="Data de saída">
                <input type="date" value={form.data_saida ?? ""} onChange={(e) => setForm({ ...form, data_saida: e.target.value || null })} className={input} />
              </F>
            )}
            <F label="Setup">
              <input list="setups" value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} placeholder="Ex.: 9.1, VWAP" className={input} />
              <datalist id="setups">
                {setups.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </F>
            <F label="Anotação" wide>
              <input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Por que entrou, o que sentiu, o que aprendeu" className={input} />
            </F>
            <div className="col-span-2 flex items-end md:col-span-4">
              <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-on-primary">
                <Plus size={16} /> Registrar
              </button>
              {error && <span className="ml-3 text-negative">{error}</span>}
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Importar nota de corretagem" subtitle="Envie o print ou a foto da nota (ou do histórico de ordens). A IA lê as operações." />
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm text-muted hover:border-text">
            <ImagePlus size={28} />
            {reading ? "Lendo..." : "Escolher imagens (até 6)"}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={reading} onChange={(e) => importNotes(e.target.files)} />
          </label>
          {note && <p className="mt-3 text-sm">{note}</p>}
          <p className="mt-3 text-xs text-muted">As imagens não ficam guardadas. As operações ficam neste navegador e na sua conta, se você entrou.</p>
        </Card>
      </div>

      {summary && g && (
        <>
          <Card className="mb-6">
            <CardHeader title="Seu desempenho" subtitle={`${g.operacoes} operações fechadas${summary.abertas ? ` · ${summary.abertas} abertas` : ""}`} />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
              <M label="Resultado" value={fmtMoney(g.resultado)} tone={g.resultado} />
              <M label="Taxa de acerto" value={g.taxa_acerto_pct == null ? "–" : `${fmtNum(g.taxa_acerto_pct, 0)}%`} />
              <M label="Payoff" value={fmtNum(g.payoff)} />
              <M label="Fator de lucro" value={fmtNum(g.fator_lucro)} />
              <M label="Média por operação" value={fmtMoney(g.expectativa)} tone={g.expectativa} />
              <M label="Ganho médio" value={fmtMoney(g.ganho_medio)} />
              <M label="Perda média" value={fmtMoney(g.perda_media)} />
              <M label="Maior queda" value={fmtMoney(summary.maior_queda)} tone={summary.maior_queda} />
            </div>
            {summary.observacoes.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
                {summary.observacoes.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            )}
          </Card>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <GroupTable title="Por setup" data={summary.por_setup} />
            <GroupTable title="Por ativo" data={summary.por_ativo} />
          </div>
          <Card className="mb-6 overflow-x-auto">
            <CardHeader
              title="Imposto do mês (DARF 6015)"
              subtitle="Day trade 20%, swing 15% (FIIs 20%), compensando prejuízos. Swing em ações é isento com vendas até R$ 20 mil no mês. Já desconta o IRRF retido na nota."
            />
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Mês</th>
                  <th className="py-2 text-right font-medium">Day trade</th>
                  <th className="py-2 text-right font-medium">Swing ações</th>
                  <th className="py-2 text-right font-medium">Swing FIIs</th>
                  <th className="py-2 text-right font-medium">Imposto</th>
                  <th className="py-2 text-right font-medium">IRRF retido</th>
                  <th className="py-2 text-right font-medium">DARF a pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.imposto
                  .slice()
                  .reverse()
                  .map((m) => (
                    <tr key={m.mes}>
                      <td className="py-2">{m.mes.split("-").reverse().join("/")}</td>
                      <td className="tabular py-2 text-right">{fmtMoney(m.day_trade)}</td>
                      <td className="tabular py-2 text-right">
                        {fmtMoney(m.swing_acoes)}
                        {m.isento_swing_acoes && <span className="ml-1 text-xs text-positive">isento</span>}
                      </td>
                      <td className="tabular py-2 text-right">{fmtMoney(m.swing_fiis)}</td>
                      <td className="tabular py-2 text-right">{fmtMoney(m.imposto)}</td>
                      <td className="tabular py-2 text-right">{fmtMoney(m.irrf_retido)}</td>
                      <td className="tabular py-2 text-right font-bold">{fmtMoney(m.darf)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Vence no último dia útil do mês seguinte. Abaixo de R$ 10 não se paga: acumula. Estimativa: confira com um contador.</p>
          </Card>
        </>
      )}

      <Card className="overflow-x-auto !p-0">
        <div className="px-5 pt-5">
          <CardHeader title="Operações" subtitle={trades.length ? `${trades.length} registradas` : "Nenhuma operação ainda."} />
        </div>
        {trades.length > 0 && (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-y border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Ativo</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                <th className="px-3 py-2 text-right font-medium">Entrada → saída</th>
                <th className="px-3 py-2 font-medium">Setup</th>
                <th className="px-3 py-2 text-right font-medium">Resultado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trades.map((t) => {
                const r = result(t);
                return (
                  <tr key={t.id}>
                    <td className="tabular px-4 py-2">{t.data.split("-").reverse().join("/")}</td>
                    <td className="px-3 py-2 font-bold">{t.ticker}</td>
                    <td className="px-3 py-2">
                      {t.modalidade === "day_trade" ? "Day trade" : "Swing"} · {t.lado}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{fmtNum(t.quantidade, 0)}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {fmtNum(t.preco_entrada)} → {t.preco_saida == null ? "aberta" : fmtNum(t.preco_saida)}
                    </td>
                    <td className="px-3 py-2">{t.setup || <span className="text-muted">–</span>}</td>
                    <td className={`tabular px-3 py-2 text-right font-semibold ${r == null ? "text-muted" : r >= 0 ? "text-positive" : "text-negative"}`}>
                      {r == null ? "–" : fmtMoney(r)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => save(trades.filter((x) => x.id !== t.id))} aria-label="Apagar" className="text-muted hover:text-negative">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

const input = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 outline-none focus:border-text";

function F({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function M({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const color = tone == null ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-1 font-bold ${color}`}>{value}</div>
    </div>
  );
}

function GroupTable({ title, data }: { title: string; data: Record<string, GroupStats> }) {
  return (
    <Card className="overflow-x-auto">
      <CardHeader title={title} />
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="py-2 font-medium" />
            <th className="py-2 text-right font-medium">Ops.</th>
            <th className="py-2 text-right font-medium">Acerto</th>
            <th className="py-2 text-right font-medium">Payoff</th>
            <th className="py-2 text-right font-medium">Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Object.entries(data)
            .slice(0, 10)
            .map(([k, s]) => (
              <tr key={k}>
                <td className="py-2 font-semibold">{k}</td>
                <td className="tabular py-2 text-right">{s.operacoes}</td>
                <td className="tabular py-2 text-right">{s.taxa_acerto_pct == null ? "–" : `${fmtNum(s.taxa_acerto_pct, 0)}%`}</td>
                <td className="tabular py-2 text-right">{fmtNum(s.payoff)}</td>
                <td className={`tabular py-2 text-right font-semibold ${s.resultado >= 0 ? "text-positive" : "text-negative"}`}>{fmtMoney(s.resultado)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}
