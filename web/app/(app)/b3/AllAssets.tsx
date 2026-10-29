"use client";

import { Search, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Card, EmptyState } from "@/app/components/ui";
import { apiFetch, type B3List } from "@/lib/api";
import { changeColor, formatBRL, formatPercent } from "@/lib/format";

const PAGE = 50;
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function AllAssets({ initialQuery, initialType }: { initialQuery: string; initialType: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [data, setData] = useState<B3List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Espera a pessoa parar de digitar antes de buscar; a URL guarda a busca para voltar do ativo no mesmo ponto.
  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams({ q: query, limite: String(PAGE) });
      if (type) params.set("tipo", type);
      apiFetch<B3List>(`/b3/ativos?${params}`)
        .then((r) => {
          setData(r);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
      const url = new URLSearchParams();
      if (query) url.set("q", query);
      if (type) url.set("tipo", type);
      window.history.replaceState(null, "", url.size ? `?${url}` : window.location.pathname);
    }, 250);
    return () => clearTimeout(id);
  }, [query, type]);

  async function loadMore() {
    if (!data) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ q: query, limite: String(PAGE), offset: String(data.ativos.length) });
    if (type) params.set("tipo", type);
    try {
      const more = await apiFetch<B3List>(`/b3/ativos?${params}`);
      setData({ ...more, ativos: [...data.ativos, ...more.ativos] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const all = data?.tipos.reduce((s, t) => s + t.total, 0);
  const pregao = data?.pregao ? new Date(`${data.pregao}T12:00:00`).toLocaleDateString("pt-BR") : null;

  return (
    <>
      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código ou nome (ex.: MGLU3, Magazine, BOVA11)"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          aria-label="Buscar ativo da B3"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[{ key: "", label: "Todos", total: all }, ...(data?.tipos ?? [])].map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`rounded-full px-4 py-2 font-semibold transition-colors ${
              type === t.key ? "bg-primary text-on-primary" : "border border-border bg-surface text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.total != null && <span className="ml-1.5 tabular opacity-70">{t.total}</span>}
          </button>
        ))}
      </div>

      {error && <EmptyState>Não consegui carregar a lista da B3: {error}</EmptyState>}
      {data && !error && (
        <>
          <p className="mb-3 text-sm text-muted">
            {data.total} {data.total === 1 ? "ativo" : "ativos"}
            {pregao && ` · fechamento do pregão de ${pregao}`}
            {!query && " · do maior para o menor volume negociado"}
          </p>
          {data.ativos.length === 0 ? (
            <EmptyState>
              {all ? "Nenhum ativo encontrado com essa busca." : "A lista da B3 ainda está sendo carregada. Tente de novo em alguns minutos."}
            </EmptyState>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-border">
                {data.ativos.map((a) => (
                  <li key={a.ticker}>
                    <Link
                      href={`/ativo/${a.ticker}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-surface-2 md:grid-cols-[1fr_7rem_7rem_6rem_6rem] md:px-6"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AssetLogo ticker={a.ticker} src={a.logo_url} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-bold">
                            {a.ticker}
                            {a.rank && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                                <Trophy size={11} /> {a.rank}º no ranking
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-sm text-muted">{a.name}</span>
                        </span>
                      </span>
                      <span className="hidden text-sm text-muted md:block">
                        {a.type_label}
                        <span className="block text-xs">{a.spec}</span>
                      </span>
                      <span className="text-right md:text-left">
                        <span className="tabular block">{formatBRL(a.price)}</span>
                        {a.change_percent != null && (
                          <span className={`tabular block text-xs md:hidden ${changeColor(a.change_percent)}`}>
                            {formatPercent(a.change_percent)}
                          </span>
                        )}
                      </span>
                      <span className={`tabular hidden md:block ${changeColor(a.change_percent ?? 0)}`}>
                        {a.change_percent != null ? formatPercent(a.change_percent) : "–"}
                      </span>
                      <span className="tabular hidden text-sm text-muted md:block" title="Volume negociado no pregão">
                        R$ {compact.format(a.volume)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {data.ativos.length < data.total && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full bg-accent-bg px-6 py-2.5 text-sm font-semibold text-accent-text disabled:opacity-60"
              >
                {loadingMore ? "Carregando..." : `Mostrar mais (${data.total - data.ativos.length} restantes)`}
              </button>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Fonte: {data.fonte}.</p>
        </>
      )}
      {!data && !error && <EmptyState>Carregando a lista da B3...</EmptyState>}
    </>
  );
}
