"use client";

import { BellPlus, BellRing, RefreshCw, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp, type StoredAlert } from "@/app/components/AppProvider";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Card } from "@/app/components/ui";
import { apiFetch, type AlertKind, type AssetSummary } from "@/lib/api";
import { formatBRL, formatNumber, formatPercent, formatProbability, formatTime } from "@/lib/format";

const KINDS: { kind: AlertKind; label: string; unit: string; hint: string }[] = [
  { kind: "preco_acima", label: "Preço chegar a ou passar de", unit: "R$", hint: "Ex.: 40,00" },
  { kind: "preco_abaixo", label: "Preço chegar a ou cair abaixo de", unit: "R$", hint: "Ex.: 30,00" },
  { kind: "alta_dia", label: "Subir no dia pelo menos", unit: "%", hint: "Ex.: 3" },
  { kind: "queda_dia", label: "Cair no dia pelo menos", unit: "%", hint: "Ex.: 3" },
  { kind: "entrou_top", label: "Entrar no top do ranking", unit: "posição", hint: "Ex.: 5" },
  { kind: "prob_acima", label: "Probabilidade de superar o índice acima de", unit: "%", hint: "Ex.: 60" },
];

function ruleText(a: Pick<StoredAlert, "kind" | "value">) {
  const k = KINDS.find((x) => x.kind === a.kind)!;
  if (k.unit === "R$") return `${k.label} ${formatBRL(a.value)}`;
  if (k.unit === "posição") return `Entrar no top ${a.value} do ranking`;
  return `${k.label} ${formatNumber(a.value)}%`;
}

function suggestedValue(kind: AlertKind, asset?: AssetSummary) {
  if (!asset) return "";
  const round = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");
  switch (kind) {
    case "preco_acima":
      return round(asset.price * 1.05);
    case "preco_abaixo":
      return round(asset.price * 0.95);
    case "alta_dia":
    case "queda_dia":
      return "3";
    case "entrou_top":
      return String(Math.max(1, Math.min(3, asset.rank - 1)));
    case "prob_acima":
      return String(Math.min(65, Math.round(asset.probability_outperform * 100) + 3));
  }
}

export function Alerts({ initialTicker }: { initialTicker?: string }) {
  const { ready, prefs, setPrefs, alerts, saveAlerts, checkAlerts, checking } = useApp();
  const [canNotify, setCanNotify] = useState(false);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [ticker, setTicker] = useState(initialTicker ?? "");
  const [kind, setKind] = useState<AlertKind>("preco_acima");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [explaining, setExplaining] = useState<string | null>(null);

  useEffect(() => {
    setCanNotify(typeof Notification !== "undefined" && Notification.permission !== "denied");
    apiFetch<{ ativos: AssetSummary[] }>("/ativos")
      .then((r) => setAssets(r.ativos.sort((a, b) => a.ticker.localeCompare(b.ticker))))
      .catch(() => setAssets([]));
  }, []);

  const byTicker = useMemo(() => new Map(assets.map((a) => [a.ticker, a])), [assets]);
  const selected = byTicker.get(ticker);

  useEffect(() => {
    setValue(suggestedValue(kind, selected));
  }, [kind, selected]);

  // Marca os disparados como vistos ao abrir a tela (zera o contador do sino).
  useEffect(() => {
    if (ready && alerts.some((a) => a.triggeredAt && !a.seen)) {
      saveAlerts((cur) => cur.map((a) => (a.triggeredAt ? { ...a, seen: true } : a)));
    }
  }, [ready, alerts, saveAlerts]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(value.replace(/\./g, "").replace(",", "."));
    if (!selected) return setError("Escolha um ativo da lista.");
    if (!Number.isFinite(v) || v <= 0) return setError("Informe um valor maior que zero.");
    setError("");
    const alert: StoredAlert = {
      id: crypto.randomUUID(),
      ticker: selected.ticker,
      kind,
      value: v,
      createdAt: new Date().toISOString(),
    };
    saveAlerts((cur) => [alert, ...cur]);
    setTimeout(checkAlerts, 0);
  }

  async function explain(a: StoredAlert) {
    setExplaining(a.id);
    try {
      const body = await apiFetch<{ explanation: string }>("/alertas/explicar", {
        method: "POST",
        body: JSON.stringify({ alert: { id: a.id, ticker: a.ticker, kind: a.kind, value: a.value }, level: prefs.level }),
      });
      saveAlerts((cur) => cur.map((x) => (x.id === a.id ? { ...x, explanation: body.explanation } : x)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar explicação.";
      saveAlerts((cur) => cur.map((x) => (x.id === a.id ? { ...x, explanation: msg } : x)));
    } finally {
      setExplaining(null);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") setPrefs({ notifications: true });
    else setCanNotify(false);
  }

  const triggered = alerts.filter((a) => a.triggeredAt);
  const active = alerts.filter((a) => !a.triggeredAt);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="h-fit">
        <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
          <BellPlus size={20} /> Novo alerta
        </h2>
        <form onSubmit={add} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Ativo
            <input
              list="ativos"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase().trim())}
              placeholder="Digite o código, ex.: PETR4"
              className="rounded-2xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-primary"
            />
            <datalist id="ativos">
              {assets.map((a) => (
                <option key={a.ticker} value={a.ticker}>
                  {a.name}
                </option>
              ))}
            </datalist>
          </label>
          {selected && (
            <div className="flex items-center gap-3 rounded-2xl bg-track/60 px-4 py-3 text-sm">
              <AssetLogo ticker={selected.ticker} src={selected.logo_url} size={32} />
              <span className="min-w-0 flex-1 truncate">{selected.name}</span>
              <span className="tabular text-right">
                {formatBRL(selected.price)} · {formatPercent(selected.change_percent)}
                <span className="block text-xs text-muted">
                  {selected.rank}º · prob. {formatProbability(selected.probability_outperform)}
                </span>
              </span>
            </div>
          )}
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Avise quando
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AlertKind)}
              className="rounded-2xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-primary"
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Valor ({KINDS.find((k) => k.kind === kind)!.unit})
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={KINDS.find((k) => k.kind === kind)!.hint}
              className="rounded-2xl border border-border bg-background px-4 py-3 font-normal outline-none focus:border-primary"
            />
          </label>
          {error && <p className="text-sm text-negative">{error}</p>}
          <button type="submit" className="rounded-full bg-primary py-3.5 font-semibold text-on-primary">
            Criar alerta
          </button>
        </form>
        {!prefs.notifications && canNotify && (
          <button
            onClick={enableNotifications}
            className="mt-4 w-full rounded-full bg-accent-bg py-3 text-sm font-semibold text-accent-text"
          >
            Receber notificação do navegador
          </button>
        )}
      </Card>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">
            Conferidos a cada {prefs.alertMinutes} min ·{" "}
            <Link href="/configuracoes" className="underline">
              ajustar
            </Link>
          </span>
          <button
            onClick={checkAlerts}
            disabled={checking || !active.length}
            className="inline-flex items-center gap-2 rounded-full bg-track px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> Conferir agora
          </button>
        </div>

        {triggered.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <BellRing size={20} /> Disparados
            </h2>
            <div className="flex flex-col gap-3">
              {triggered.map((a) => (
                <div key={a.id} className="rounded-3xl border border-accent-text/30 bg-accent-bg/50 p-5">
                  <AlertRow a={a} assets={byTicker} onDelete={() => saveAlerts((c) => c.filter((x) => x.id !== a.id))}>
                    <button
                      onClick={() =>
                        saveAlerts((c) =>
                          c.map((x) => (x.id === a.id ? { ...x, triggeredAt: undefined, explanation: undefined, seen: undefined } : x)),
                        )
                      }
                      aria-label="Reativar"
                      title="Reativar"
                      className="rounded-full p-2 hover:bg-track"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </AlertRow>
                  <p className="mt-2 text-sm">
                    {a.message} <span className="text-muted">Disparou às {formatTime(a.triggeredAt!)}.</span>
                  </p>
                  {a.explanation ? (
                    <div className="mt-3 rounded-2xl bg-surface p-4 text-sm leading-relaxed">
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-accent-text">
                        <Sparkles size={14} /> Explicação da IA
                      </div>
                      <p className="whitespace-pre-line">{a.explanation}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => explain(a)}
                      disabled={explaining === a.id}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-60"
                    >
                      <Sparkles size={16} /> {explaining === a.id ? "Analisando..." : "Por que disparou?"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-bold">Aguardando ({active.length})</h2>
          {!ready ? null : active.length ? (
            <div className="flex flex-col gap-3">
              {active.map((a) => (
                <div key={a.id} className="rounded-3xl border border-border bg-surface p-5">
                  <AlertRow a={a} assets={byTicker} onDelete={() => saveAlerts((c) => c.filter((x) => x.id !== a.id))} />
                  {a.message && (
                    <p className={`mt-2 text-sm ${a.available === false ? "text-negative" : "text-muted"}`}>
                      {a.message}
                      {a.checkedAt && ` Conferido às ${formatTime(a.checkedAt)}.`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Card className="text-sm text-muted">
              Nenhum alerta ativo. Crie o primeiro ao lado, ou abra um ativo e toque em &quot;Criar alerta&quot;.
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function AlertRow({
  a,
  assets,
  onDelete,
  children,
}: {
  a: StoredAlert;
  assets: Map<string, AssetSummary>;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const asset = assets.get(a.ticker);
  return (
    <div className="flex items-center gap-3">
      <AssetLogo ticker={a.ticker} src={asset?.logo_url} size={40} />
      <Link href={`/ativo/${a.ticker}`} className="min-w-0 flex-1">
        <span className="block font-bold">{a.ticker}</span>
        <span className="block truncate text-sm text-muted">{ruleText(a)}</span>
      </Link>
      {children}
      <button onClick={onDelete} aria-label="Excluir" title="Excluir" className="rounded-full p-2 hover:bg-track">
        <Trash2 size={16} />
      </button>
    </div>
  );
}
