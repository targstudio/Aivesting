"use client";

import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Plus, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/app/components/AppProvider";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Donut, PairedBars } from "@/app/components/charts";
import { Markdown } from "@/app/components/Markdown";
import { Card, CardHeader, InfoBanner, MiniStat } from "@/app/components/ui";
import {
  apiFetch,
  HOLDING_CLASSES,
  type AdvisorInput,
  type Holding,
  type HoldingClass,
  type PortfolioAnalysis,
  type PortfolioRead,
} from "@/lib/api";
import { changeColor, formatBRL, formatNumber, formatProbability, formatRatio } from "@/lib/format";
import {
  deletePortfolio,
  emptyHolding,
  imageToDataUrl,
  loadPortfolio,
  mergeHoldings,
  savePortfolio,
  saveReading,
  syncPortfolio,
  type StoredPortfolio,
} from "@/lib/portfolio";
import { Chat } from "../assistente/Chat";
import { IncomeCard } from "./Income";
import { RebalanceCard } from "./Rebalance";

const MAX_IMAGES = 6;

// Cores das classes (paleta dos gráficos).
const CLASS_COLOR: Record<string, string> = {
  acoes: "rgb(var(--chart-1))",
  fiis: "rgb(var(--chart-5))",
  renda_fixa: "rgb(var(--chart-3))",
  caixa: "rgb(var(--chart-4))",
  etf: "rgb(200 120 40)",
  bdr: "rgb(0 128 160)",
  internacional: "rgb(0 128 160)",
  fundos: "rgb(var(--chart-2))",
  cripto: "rgb(150 90 180)",
  outros: "rgb(120 120 120)",
};

function loadAdvisor(): AdvisorInput | null {
  try {
    const raw = localStorage.getItem("aivesting.assessor");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const pct = (v: number | null | undefined) => formatRatio(v, false);

export function Portfolio() {
  const { prefs, ready } = useApp();
  const [stored, setStored] = useState<StoredPortfolio | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<{ holdings: Holding[]; read?: PortfolioRead } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState<{ state: "loading" | "done" | "error"; text: string } | null>(null);
  const advisor = useMemo(() => (loaded ? loadAdvisor() : null), [loaded]);

  useEffect(() => {
    const local = loadPortfolio();
    setStored(local);
    setLoaded(true);
    if (local) syncPortfolio(local).then((p) => p !== local && setStored(p));
  }, []);

  const body = useMemo(
    () => stored && { holdings: stored.holdings, advisor: advisor ?? undefined, level: prefs.level },
    [stored, advisor, prefs.level],
  );

  useEffect(() => {
    if (!body) return setAnalysis(null);
    setAnalysis(null);
    apiFetch<PortfolioAnalysis>("/carteira/analise", { method: "POST", body: JSON.stringify(body) })
      .then(setAnalysis)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao analisar a carteira."));
  }, [body]);

  const readingKey = stored ? `${stored.updatedAt}|${prefs.level}|${advisor ? "plano" : ""}` : "";

  const explain = useCallback(async () => {
    if (!stored || !body) return;
    setReading({ state: "loading", text: "" });
    try {
      const r = await apiFetch<{ explanation: string }>("/carteira/explicar", { method: "POST", body: JSON.stringify(body) });
      setReading({ state: "done", text: r.explanation });
      saveReading(stored, { key: readingKey, text: r.explanation });
    } catch (e) {
      setReading({ state: "error", text: e instanceof Error ? e.message : "Erro ao gerar a análise." });
    }
  }, [stored, body, readingKey]);

  // A leitura da IA sai sozinha uma vez por versão da carteira (se a leitura automática estiver ligada).
  useEffect(() => {
    if (!ready || !stored || !analysis) return;
    if (stored.reading?.key === readingKey) return setReading({ state: "done", text: stored.reading.text });
    if (prefs.aiAuto) explain();
    else setReading(null);
  }, [ready, stored, analysis, readingKey, prefs.aiAuto, explain]);

  async function readImages(files: File[]) {
    setError("");
    setNotice("");
    setUploading(true);
    try {
      const images = await Promise.all(files.slice(0, MAX_IMAGES).map(imageToDataUrl));
      const read = await apiFetch<PortfolioRead>("/carteira/ler", { method: "POST", body: JSON.stringify({ images }) });
      if (!read.holdings.length) {
        setError(read.warnings[0] ?? "Não encontrei posições nesses prints. Tente um recorte com a tabela da carteira.");
        return;
      }
      setDraft({ holdings: read.holdings, read });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler os prints.");
    } finally {
      setUploading(false);
    }
  }

  async function confirm(mode: "replace" | "merge") {
    if (!draft) return;
    const clean = draft.holdings
      .map((h) => ({ ...h, ticker: h.ticker?.trim().toUpperCase() || null, name: h.name.trim() }))
      .filter((h) => (h.ticker || h.name) && ((h.value ?? 0) > 0 || ((h.quantity ?? 0) > 0 && (h.price ?? 0) > 0)));
    if (!clean.length) return setError("Preencha ao menos uma posição com valor.");
    const holdings = mode === "merge" && stored ? mergeHoldings(stored.holdings, clean) : clean;
    const { stored: next, synced } = await savePortfolio(holdings, stored);
    setStored(next);
    setDraft(null);
    setReading(null);
    setNotice(synced ? "Carteira salva." : "Carteira salva neste navegador. O banco não respondeu agora; tentamos de novo na próxima vez que salvar.");
  }

  async function remove() {
    if (!window.confirm("Apagar a carteira deste navegador e do banco?")) return;
    await deletePortfolio(stored);
    setStored(null);
    setAnalysis(null);
    setReading(null);
    setNotice("Carteira apagada.");
  }

  if (!loaded) return <Card className="text-sm text-muted">Carregando...</Card>;

  if (draft) {
    return <Review draft={draft} setDraft={setDraft} hasCurrent={!!stored} onConfirm={confirm} onCancel={() => setDraft(null)} error={error} />;
  }

  const uploader = (
    <div id="atualizar" className="scroll-mt-6">
      <Uploader
        compact={!!stored}
        uploading={uploading}
        onFiles={readImages}
        onManual={() => setDraft({ holdings: stored ? stored.holdings : [emptyHolding()] })}
        hasCurrent={!!stored}
        onDelete={remove}
        error={error}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/10 px-4 py-3 text-sm font-medium text-positive">
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}
      {!stored && uploader}
      {stored && !analysis && (
        <div className="grid gap-4">
          <div className="h-56 animate-pulse rounded-card bg-nav/90" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-track" />
            ))}
          </div>
        </div>
      )}
      {stored && analysis && (
        <Dashboard
          holdings={stored.holdings}
          analysis={analysis}
          reading={reading}
          onExplain={explain}
          hasAdvisor={!!advisor}
          updatedAt={stored.updatedAt}
          onUpdate={() => document.getElementById("atualizar")?.scrollIntoView({ behavior: "smooth" })}
          onEdit={() => setDraft({ holdings: stored.holdings })}
        />
      )}
      {stored && uploader}
      {stored && analysis && <InfoBanner>{analysis.disclaimer}</InfoBanner>}
    </div>
  );
}

// ---- Envio dos prints ----

function Uploader({
  compact,
  uploading,
  onFiles,
  onManual,
  hasCurrent,
  onDelete,
  error,
}: {
  compact: boolean;
  uploading: boolean;
  onFiles: (f: File[]) => void;
  onManual: () => void;
  hasCurrent: boolean;
  onDelete: () => void;
  error: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const add = useCallback((list: FileList | File[]) => {
    const images = [...list].filter((f) => f.type.startsWith("image/"));
    setFiles((cur) => [...cur, ...images].slice(0, MAX_IMAGES));
  }, []);

  // Ctrl+V / Cmd+V cola o print direto da área de transferência.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.files ?? [])];
      if (items.length) add(items);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  async function send() {
    await onFiles(files);
    setFiles([]);
  }

  return (
    <Card className={compact ? "!p-5" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{hasCurrent ? "Atualizar a carteira" : "Importe sua carteira por print"}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tire print da tela de posições da sua corretora (ações, FIIs, renda fixa, Tesouro). A IA lê ativo, quantidade, preço
            médio e saldo, e você confere tudo antes de salvar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onManual} className="inline-flex items-center gap-2 rounded-full bg-track px-4 py-2 text-sm font-semibold">
            <Plus size={16} /> {hasCurrent ? "Editar posições" : "Digitar posições"}
          </button>
          {hasCurrent && (
            <button onClick={onDelete} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-negative hover:bg-negative/10">
              <Trash2 size={16} /> Apagar carteira
            </button>
          )}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors ${
          compact ? "py-6" : "py-10"
        } ${over ? "border-primary bg-accent-bg/50" : "border-border hover:border-primary/60 hover:bg-surface-2"}`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-bg text-accent-text">
          <ImagePlus size={20} />
        </span>
        <span className="font-semibold">Arraste os prints aqui, clique para escolher ou cole com Ctrl+V</span>
        <span className="text-xs text-muted">Até {MAX_IMAGES} imagens por vez (PNG, JPG ou WEBP)</span>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {previews.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Print ${i + 1}`} className="h-20 w-32 rounded-lg border border-border object-cover object-top" />
              <button
                onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                aria-label="Remover print"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-nav text-white"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={send}
            disabled={uploading}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary disabled:opacity-60"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {uploading ? "A IA está lendo os prints..." : `Ler ${files.length === 1 ? "o print" : `os ${files.length} prints`} com IA`}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Os prints vão só para a IA ler e não ficam guardados. Ficam salvas apenas as posições que você confirmar. Se o print mostrar
        nome ou número de conta, pode recortar antes.
      </p>
    </Card>
  );
}

// ---- Conferência das posições lidas ----

function numberOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function NumberCell({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(value == null ? "" : formatNumber(value));
  useEffect(() => setText(value == null ? "" : formatNumber(value)), [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(numberOrNull(text))}
      className="tabular w-full min-w-[84px] rounded-lg border border-border bg-background px-2 py-1.5 text-right outline-none focus:border-primary"
    />
  );
}

function Review({
  draft,
  setDraft,
  hasCurrent,
  onConfirm,
  onCancel,
  error,
}: {
  draft: { holdings: Holding[]; read?: PortfolioRead };
  setDraft: (d: { holdings: Holding[]; read?: PortfolioRead }) => void;
  hasCurrent: boolean;
  onConfirm: (mode: "replace" | "merge") => void;
  onCancel: () => void;
  error: string;
}) {
  const { holdings, read } = draft;
  const update = (i: number, patch: Partial<Holding>) =>
    setDraft({ ...draft, holdings: holdings.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const total = holdings.reduce((s, h) => s + (h.value ?? (h.quantity ?? 0) * (h.price ?? 0)), 0);
  const seen = read?.section_totals.reduce((s, t) => s + t.value, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title={read ? "Confira o que a IA leu" : "Suas posições"}
          subtitle={read ? `${holdings.length} posições${read.broker ? ` · ${read.broker}` : ""}. Corrija o que estiver errado antes de salvar.` : "Digite ou corrija as posições da sua carteira."}
          value={formatBRL(total)}
        />
        {read && seen > 0 && (
          <div
            className={`mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
              Math.abs(total - seen) <= Math.max(1, seen * 0.005) ? "bg-positive/10 text-positive" : "bg-accent-bg text-accent-text"
            }`}
          >
            {Math.abs(total - seen) <= Math.max(1, seen * 0.005) ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
            <span>
              {Math.abs(total - seen) <= Math.max(1, seen * 0.005)
                ? `A soma confere com o total dos prints (${read.section_totals.map((t) => `${t.label} ${formatBRL(t.value)}`).join(", ")}).`
                : `A soma das linhas (${formatBRL(total)}) não bate com o total dos prints (${formatBRL(seen)}). Confira se faltou alguma linha.`}
            </span>
          </div>
        )}
        {read?.warnings.map((w) => (
          <p key={w} className="mb-2 flex items-start gap-2 text-sm text-accent-text">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
          </p>
        ))}
        <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-2 font-semibold">Ativo</th>
                <th className="py-2 pr-2 font-semibold">Nome</th>
                <th className="py-2 pr-2 font-semibold">Classe</th>
                <th className="py-2 pr-2 text-right font-semibold">Quantidade</th>
                <th className="py-2 pr-2 text-right font-semibold">Preço médio</th>
                <th className="py-2 pr-2 text-right font-semibold">Preço atual</th>
                <th className="py-2 pr-2 text-right font-semibold">Saldo (R$)</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} className="border-b border-border/70 align-middle">
                  <td className="py-2 pr-2">
                    <input
                      aria-label="Ticker"
                      value={h.ticker ?? ""}
                      placeholder="Ex.: PETR4"
                      onChange={(e) => update(i, { ticker: e.target.value.toUpperCase().slice(0, 12) || null })}
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 font-semibold uppercase outline-none focus:border-primary"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      aria-label="Nome"
                      value={h.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      className="w-full min-w-[140px] rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      aria-label="Classe"
                      value={h.asset_class}
                      onChange={(e) => update(i, { asset_class: e.target.value as HoldingClass, indexer: e.target.value === "renda_fixa" ? h.indexer ?? "pos" : null })}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                    >
                      {Object.entries(HOLDING_CLASSES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {h.asset_class === "renda_fixa" && (
                      <select
                        aria-label="Indexador"
                        value={h.indexer ?? "pos"}
                        onChange={(e) => update(i, { indexer: e.target.value as Holding["indexer"] })}
                        className="ml-1 rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                      >
                        <option value="pos">Pós (CDI)</option>
                        <option value="ipca">IPCA+</option>
                        <option value="pre">Prefixado</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-2"><NumberCell label="Quantidade" value={h.quantity} onChange={(v) => update(i, { quantity: v })} /></td>
                  <td className="py-2 pr-2"><NumberCell label="Preço médio" value={h.avg_price} onChange={(v) => update(i, { avg_price: v })} /></td>
                  <td className="py-2 pr-2"><NumberCell label="Preço atual" value={h.price} onChange={(v) => update(i, { price: v })} /></td>
                  <td className="py-2 pr-2"><NumberCell label="Saldo" value={h.value} onChange={(v) => update(i, { value: v })} /></td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setDraft({ ...draft, holdings: holdings.filter((_, j) => j !== i) })}
                      aria-label="Remover linha"
                      className="rounded-full p-2 text-muted hover:bg-negative/10 hover:text-negative"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => setDraft({ ...draft, holdings: [...holdings, emptyHolding()] })}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent-text"
        >
          <Plus size={16} /> Adicionar linha
        </button>
        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={() => onConfirm("replace")} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary">
            <CheckCircle2 size={18} /> {hasCurrent && read ? "Substituir a carteira" : "Salvar carteira"}
          </button>
          {hasCurrent && read && (
            <button onClick={() => onConfirm("merge")} className="inline-flex items-center gap-2 rounded-full bg-track px-6 py-3 font-semibold">
              <Upload size={18} /> Juntar com a carteira atual
            </button>
          )}
          <button onClick={onCancel} className="px-3 py-3 text-sm font-semibold text-muted hover:text-text">
            Cancelar
          </button>
        </div>
        {hasCurrent && read && (
          <p className="mt-3 text-xs text-muted">
            Juntar: as posições destes prints entram na carteira e substituem as do mesmo ativo. Use para somar prints de outra
            corretora ou de outra seção.
          </p>
        )}
      </Card>
    </div>
  );
}

// ---- Painel da carteira ----

type Reading = { state: "loading" | "done" | "error"; text: string } | null;

function Dashboard({
  analysis: a,
  reading,
  onExplain,
  hasAdvisor,
  updatedAt,
  onUpdate,
  onEdit,
  holdings,
}: {
  holdings: Holding[];
  analysis: PortfolioAnalysis;
  reading: Reading;
  onExplain: () => void;
  hasAdvisor: boolean;
  updatedAt: string;
  onUpdate: () => void;
  onEdit: () => void;
}) {
  const risk = a.risk;
  const chatPortfolio = useMemo(
    () => ({ ...a, positions: a.positions.map(({ logo_url: _l, ...p }) => p), disclaimer: undefined }),
    [a],
  );
  const high = a.alerts.filter((x) => x.level !== "baixo").length;
  return (
    <>
      {/* Destaque: patrimônio, resultado e composição */}
      <section className="overflow-hidden rounded-card bg-nav text-white">
        <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-nav-text">
              <span>Patrimônio na carteira</span>
              <span className="text-nav-muted">· atualizada em {new Date(updatedAt).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="tabular mt-2 text-4xl font-bold tracking-tight md:text-5xl">{formatBRL(a.total)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {a.result && (
                <span
                  className={`tabular rounded-full px-3 py-1 font-semibold ${a.result.result >= 0 ? "bg-positive/20 text-[rgb(110_220_160)]" : "bg-negative/25 text-[rgb(255_140_140)]"}`}
                >
                  {a.result.result >= 0 ? "+" : "−"}
                  {formatBRL(Math.abs(a.result.result))} ({formatRatio(a.result.result_pct)}) sobre o preço médio
                </span>
              )}
              <span className="rounded-full bg-white/10 px-3 py-1 text-nav-text">{a.positions.length} posições</span>
            </div>
            <div className="mt-6">
              <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
                {a.by_class.map((g) => (
                  <div key={g.key} style={{ width: `${g.pct * 100}%`, background: CLASS_COLOR[g.key] }} title={`${g.label}: ${pct(g.pct)}`} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {a.by_class.map((g) => (
                  <span key={g.key} className="flex items-center gap-2 text-nav-text">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[g.key] }} />
                    {g.label}
                    <strong className="tabular text-white">{pct(g.pct)}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 self-center">
            <HeroStat label="Retorno ao ano em 10 anos" value={formatRatio(risk?.cagr)} hint={risk ? `${risk.benchmark} ${formatRatio(risk.benchmark_cagr)} · CDI ${formatRatio(risk.cdi_cagr)}` : "sem histórico no app"} accent />
            <HeroStat label="Pior ano da carteira" value={risk?.worst_year ? formatRatio(risk.worst_year.return) : "–"} hint={risk?.worst_year ? `em ${risk.worst_year.year}` : ""} />
            <HeroStat label="Oscilação anual" value={risk?.volatility_annual != null ? pct(risk.volatility_annual) : "–"} hint="desvio dos retornos anuais" />
            <HeroStat label="Histórico coberto" value={risk ? pct(risk.coverage) : "–"} hint="parte da carteira com dados" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-6 py-3 md:px-8">
          <button onClick={onUpdate} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
            <ImagePlus size={16} /> Enviar novos prints
          </button>
          <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-nav-text hover:bg-white/10">
            <Plus size={16} /> Editar posições
          </button>
        </div>
      </section>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Maior posição" value={a.concentration?.largest.ticker ?? a.concentration?.largest.name ?? "–"} hint={a.concentration ? `${pct(a.concentration.largest.pct)} do total` : ""} warn={(a.concentration?.largest.pct ?? 0) > 0.1} />
        <Kpi label="3 maiores posições" value={a.concentration ? pct(a.concentration.top3_pct) : "–"} hint="do patrimônio" />
        <Kpi label="Posições efetivas" value={a.concentration ? formatNumber(a.concentration.effective_positions) : "–"} hint={a.concentration ? `de ${a.concentration.positions}; quanto maior, mais diversificada` : ""} />
        <Kpi label="Pontos de atenção" value={String(high)} hint={high ? "veja abaixo" : "nenhum relevante"} warn={high > 0} />
      </div>

      {/* Composição e desempenho */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardHeader title="Composição" subtitle="Por classe e, nas ações, por setor" />
          <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
            <Donut
              size={168}
              thickness={26}
              slices={a.by_class.map((g) => ({ label: `${g.label}: ${pct(g.pct)}`, value: g.value, color: CLASS_COLOR[g.key] }))}
              center={
                <>
                  <span className="tabular text-base font-bold">{a.by_class.length}</span>
                  <span className="text-xs text-muted">{a.by_class.length === 1 ? "classe" : "classes"}</span>
                </>
              }
            />
            <ul className="w-full space-y-2.5 text-sm">
              {a.by_class.map((g) => (
                <li key={g.key} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CLASS_COLOR[g.key] }} />
                  <span className="flex-1">
                    {g.label} <span className="text-xs text-muted">({g.count})</span>
                  </span>
                  <span className="tabular text-muted">{formatBRL(g.value)}</span>
                  <span className="tabular w-14 text-right font-semibold">{pct(g.pct)}</span>
                </li>
              ))}
            </ul>
          </div>
          {a.by_sector.length > 0 && (
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="mb-3 text-sm font-semibold">Ações por setor (% do patrimônio)</h3>
              <div className="space-y-3">
                {a.by_sector.map((s) => (
                  <div key={s.key}>
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <span>{s.label}</span>
                      <span className="tabular font-semibold">{pct(s.pct)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-track">
                      <div className={`h-2 rounded-full ${s.pct > 0.35 ? "bg-negative" : "bg-primary"}`} style={{ width: `${Math.min(100, s.pct * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
        {risk ? <PerformanceCard risk={risk} /> : <Card className="text-sm text-muted">Nenhum ativo da carteira tem histórico no app ainda.</Card>}
      </div>

      {/* IA e alertas */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AiCard reading={reading} onExplain={onExplain} />
        <Card>
          <CardHeader title="Pontos de atenção" subtitle="Até 10% por ativo e até 35% por setor" />
          {a.alerts.length ? (
            <ul className="space-y-3 text-sm">
              {a.alerts.map((x) => (
                <li key={x.text} className="flex items-start gap-2.5">
                  <AlertTriangle
                    size={16}
                    className={`mt-0.5 shrink-0 ${x.level === "alto" ? "text-negative" : x.level === "medio" ? "text-accent-text" : "text-muted"}`}
                  />
                  {x.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nada fora das regras do app.</p>
          )}
        </Card>
      </div>

      <PositionsCard positions={a.positions} />

      <IncomeCard holdings={holdings} />

      <div className="grid gap-6 xl:grid-cols-2">
        {risk && risk.crises.length > 0 && <CrisesCard risk={risk} />}
        {a.plan ? (
          <PlanCard plan={a.plan} />
        ) : (
          <Card>
            <CardHeader title="Sua carteira x seu perfil" />
            <p className="text-sm text-muted">
              {hasAdvisor ? (
                "O modo assessor está desligado na API."
              ) : (
                <>
                  Responda o perfil no{" "}
                  <Link href="/assessor" className="font-semibold text-accent-text underline">
                    Assessor
                  </Link>{" "}
                  e esta área passa a mostrar quanto falta ou sobra em cada classe para chegar ao plano ideal para você.
                </>
              )}
            </p>
          </Card>
        )}
      </div>
      {a.plan && <RebalanceCard plan={a.plan} total={a.total} />}

      <div>
        <h2 className="mb-3 text-lg font-bold">Converse sobre a sua carteira</h2>
        <Chat
          endpoint="/assessor/chat"
          extra={{ portfolio: chatPortfolio, plan: a.plan ?? null }}
          page="/carteira"
          suggestions={[
            "Minha carteira está concentrada demais?",
            "Onde coloco meu próximo aporte?",
            "Como minha carteira se sairia numa crise?",
            "O que falta para ela ficar mais equilibrada?",
          ]}
          placeholder="Pergunte sobre a sua carteira"
          footer="Análise automática. Todo investimento tem riscos; rentabilidade passada não garante futura."
        />
      </div>
    </>
  );
}

function HeroStat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
      <div className="text-xs text-nav-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-bold ${accent ? "text-primary" : "text-white"}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-nav-muted">{hint}</div>}
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        {label}
        {warn && <span className="h-2 w-2 rounded-full bg-negative" aria-label="atenção" />}
      </div>
      <div className="tabular mt-1.5 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

function AiCard({ reading, onExplain }: { reading: Reading; onExplain: () => void }) {
  return (
    <section className="rounded-card border border-border bg-gradient-to-br from-surface-2 to-surface p-5 md:p-6">
      <h2 className="mb-3 flex items-center gap-2.5 font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent-text">
          <Sparkles size={16} />
        </span>
        A IA organiza sua carteira
      </h2>
      {reading?.state === "loading" && (
        <div className="space-y-2">
          {[92, 100, 80, 95, 60, 85].map((w, i) => (
            <div key={i} style={{ width: `${w}%` }} className="h-3.5 animate-pulse rounded-full bg-track" />
          ))}
        </div>
      )}
      {reading && reading.state !== "loading" && (
        <Markdown text={reading.text} className={`text-sm leading-relaxed text-text/90 md:text-[15px] ${reading.state === "error" ? "opacity-80" : ""}`} />
      )}
      {reading?.state === "done" && (
        <button onClick={onExplain} className="mt-3 text-xs font-semibold text-accent-text hover:underline">
          Atualizar análise
        </button>
      )}
      {(!reading || reading.state === "error") && (
        <button onClick={onExplain} className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
          <Sparkles size={16} /> {reading ? "Tentar de novo" : "Gerar análise da IA"}
        </button>
      )}
    </section>
  );
}

function PositionsCard({ positions }: { positions: PortfolioAnalysis["positions"] }) {
  return (
    <Card>
      <CardHeader title="Posições" subtitle="Preço do app quando o ativo está no ranking ou tem cotação; senão, o do print" />
      <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 pr-3 font-semibold">Ativo</th>
              <th className="py-2 pr-3 text-right font-semibold">Saldo</th>
              <th className="py-2 pr-3 font-semibold">Peso</th>
              <th className="py-2 pr-3 text-right font-semibold">Resultado</th>
              <th className="py-2 pr-3 text-right font-semibold">Ranking curto prazo</th>
              <th className="py-2 pr-3 text-right font-semibold">Retorno 10 anos (a.a.)</th>
              <th className="py-2 text-right font-semibold">Pior queda</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const over = p.weight > 0.1 && !["renda_fixa", "caixa"].includes(p.asset_class);
              return (
                <tr key={`${p.ticker ?? p.name}-${i}`} className="border-b border-border/70">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <AssetLogo ticker={p.ticker ?? p.name} src={p.logo_url} size={30} />
                      <div className="min-w-0">
                        {p.ticker && p.ranking ? (
                          <Link href={`/ativo/${p.ticker}`} className="font-semibold hover:underline">
                            {p.ticker}
                          </Link>
                        ) : (
                          <span className="font-semibold">{p.ticker ?? p.name}</span>
                        )}
                        <span className="block max-w-[220px] truncate text-xs text-muted">
                          {p.class_label}
                          {p.sector ? ` · ${p.sector}` : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="tabular py-2.5 pr-3 text-right font-semibold">{formatBRL(p.value)}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-track">
                        <div className={`h-1.5 rounded-full ${over ? "bg-negative" : "bg-primary"}`} style={{ width: `${Math.min(100, p.weight * 250)}%` }} />
                      </div>
                      <span className={`tabular text-xs ${over ? "font-semibold text-negative" : ""}`}>{pct(p.weight)}</span>
                    </div>
                  </td>
                  <td className={`tabular py-2.5 pr-3 text-right ${changeColor(p.result ?? 0)}`}>
                    {p.result_pct != null ? formatRatio(p.result_pct) : "–"}
                  </td>
                  <td className="tabular py-2.5 pr-3 text-right">
                    {p.ranking ? (
                      <>
                        {p.ranking.rank}º de {p.ranking.total}
                        <span className="block text-xs text-muted">{formatProbability(p.ranking.probability)} de superar o índice</span>
                      </>
                    ) : (
                      <span className="text-muted">fora do ranking</span>
                    )}
                  </td>
                  <td className={`tabular py-2.5 pr-3 text-right ${changeColor(p.risk_10y?.cagr ?? 0)}`}>
                    {p.risk_10y ? formatRatio(p.risk_10y.cagr) : <span className="text-muted">–</span>}
                  </td>
                  <td className="tabular py-2.5 text-right text-negative">{p.risk_10y ? formatRatio(p.risk_10y.max_drawdown) : <span className="text-muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PerformanceCard({ risk }: { risk: NonNullable<PortfolioAnalysis["risk"]> }) {
  const bench = new Map(risk.benchmark_annual.map((x) => [x.year, x.return]));
  const cdi = new Map(risk.cdi_annual.map((x) => [x.year, x.return]));
  return (
    <Card>
      <CardHeader
        title="Se você tivesse esta carteira nos últimos 10 anos"
        subtitle={`Histórico de cada ativo no app (${pct(risk.coverage)} da carteira; renda fixa pelo CDI), dados até ${risk.data_through}`}
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Sua carteira (a.a.)" value={formatRatio(risk.cagr)} color="rgb(var(--chart-1))" />
        <MiniStat label={`${risk.benchmark} (a.a.)`} value={formatRatio(risk.benchmark_cagr)} color="rgb(var(--chart-2))" />
        <MiniStat label="CDI (a.a.)" value={formatRatio(risk.cdi_cagr)} color="rgb(var(--chart-3))" />
      </div>
      <PairedBars
        groups={risk.annual.map((x) => ({
          label: String(x.year).slice(2),
          values: [x.return * 100, bench.has(x.year) ? bench.get(x.year)! * 100 : null, cdi.has(x.year) ? cdi.get(x.year)! * 100 : null],
        }))}
        series={[
          { label: "Sua carteira", color: "rgb(var(--chart-1))" },
          { label: risk.benchmark, color: "rgb(var(--chart-2))" },
          { label: "CDI", color: "rgb(var(--chart-3))" },
        ]}
      />
      <p className="mt-3 text-xs text-muted">Simulação com os pesos de hoje, sem aportes nem rebalanceamento. Rentabilidade passada não garante rentabilidade futura.</p>
    </Card>
  );
}

function CrisesCard({ risk }: { risk: NonNullable<PortfolioAnalysis["risk"]> }) {
  return (
    <Card>
      <CardHeader title="Nas crises" subtitle={`Queda da carteira de hoje do início ao fundo de cada crise, comparada ao ${risk.benchmark}`} />
      <div className="space-y-3">
        {risk.crises.map((c) => {
          const worst = Math.min(c.return, c.benchmark ?? 0, -0.01);
          return (
            <div key={c.key}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {c.label} <span className="text-xs font-normal text-muted">{c.start.slice(0, 4)}</span>
                </span>
                <span className="tabular text-xs text-muted">
                  carteira <strong className={changeColor(c.return)}>{formatRatio(c.return)}</strong>
                  {c.benchmark != null && <> · {risk.benchmark} {formatRatio(c.benchmark)}</>}
                </span>
              </div>
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-track">
                  <div className="h-2 rounded-full bg-chart-1" style={{ width: `${Math.min(100, (Math.min(0, c.return) / worst) * 100)}%` }} />
                </div>
                {c.benchmark != null && (
                  <div className="h-1.5 rounded-full bg-track">
                    <div className="h-1.5 rounded-full bg-chart-2" style={{ width: `${Math.min(100, (Math.min(0, c.benchmark) / worst) * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">Barra amarela: sua carteira. Barra cinza: {risk.benchmark}. Ativos mais novos que a crise ficam de fora do cálculo.</p>
    </Card>
  );
}

function PlanCard({ plan }: { plan: NonNullable<PortfolioAnalysis["plan"]> }) {
  return (
    <Card>
      <CardHeader
        title="Sua carteira x plano do assessor"
        subtitle={`Perfil ${plan.profile} · ${plan.term_label.toLowerCase()}`}
        action={
          <Link href="/assessor" className="text-sm font-semibold text-accent-text hover:underline">
            Ver plano
          </Link>
        }
      />
      <div className="space-y-4">
        {plan.comparison.map((c) => (
          <div key={c.key}>
            <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-semibold">{c.label}</span>
              <span className="tabular text-xs text-muted">
                hoje {pct(c.current_pct)} · plano {pct(c.target_pct)} ·{" "}
                <span className={c.diff_value > 0 ? "text-positive" : c.diff_value < 0 ? "text-negative" : ""}>
                  {Math.abs(c.diff_value) < 1 ? "no alvo" : `${c.diff_value > 0 ? "faltam" : "sobram"} ${formatBRL(Math.abs(c.diff_value))}`}
                </span>
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-track">
              <div className="h-2.5 rounded-full bg-chart-2" style={{ width: `${Math.min(100, c.current_pct * 100)}%` }} />
              <span className="absolute -top-1 w-1 rounded-full bg-primary" style={{ left: `calc(${Math.min(100, c.target_pct * 100)}% - 2px)`, height: 18 }} title="Plano" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Barra escura: sua carteira hoje. Traço amarelo: o plano para o seu perfil, com o total da carteira.</p>
    </Card>
  );
}
