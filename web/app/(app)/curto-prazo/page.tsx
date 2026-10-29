import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AiInsight } from "@/app/components/AiInsight";
import { AssetLogo } from "@/app/components/AssetLogo";
import { Term } from "@/app/components/Term";
import { Breadcrumbs, Card, EmptyState, PageTitle, Segmented, Stat } from "@/app/components/ui";
import {
  getShortTerm,
  type AssetClass,
  type ShortTermAsset,
  type ShortTermList,
  type ShortTermSignal,
  type ShortTermView,
} from "@/lib/api";
import { formatBRL, formatNumber, formatRatio, formatUpdated } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIEWS: { key: ShortTermView; label: string }[] = [
  { key: "oportunidades", label: "Barato e ganhando força" },
  { key: "pvp", label: "Menor P/VP" },
  { key: "dividendos", label: "Mais dividendos" },
  { key: "todos", label: "Todos" },
];

const SIGNAL_STYLE: Record<ShortTermSignal, string> = {
  barato_subindo: "bg-positive/10 text-positive",
  barato_parado: "bg-accent-bg text-accent-text",
  barato_caindo: "bg-negative/10 text-negative",
  subindo: "bg-track text-text",
  neutro: "bg-track text-muted",
  sem_preco: "bg-track text-muted",
};

const RISK_STYLE = { baixo: "text-positive", medio: "text-accent-text", alto: "text-negative" };

const PAGE = 30;

function money(v: number | null | undefined) {
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

function AssetCard({ a, fii, position }: { a: ShortTermAsset; fii: boolean; position: number }) {
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
          <span className={`rounded-full px-2.5 py-1 ${SIGNAL_STYLE[a.signal]}`}>{a.signal_label}</span>
          <span className={`rounded-full bg-track px-2.5 py-1 ${RISK_STYLE[a.risk]}`}>{a.risk_label}</span>
          <span className="rounded-full bg-primary px-2.5 py-1 text-on-primary">Nota {a.scores.total ?? "–"}</span>
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

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Bar label="Desconto" value={a.scores.value} />
        <Bar label={fii ? "Qualidade" : "Saúde"} value={a.scores.quality} />
        <Bar label="Embalo" value={a.scores.momentum} />
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

function Summary({ data, fii }: { data: ShortTermList; fii: boolean }) {
  const s = data.signals;
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat value={formatNumber(data.total_listed)} label={fii ? "fundos olhados" : "ações olhadas"} />
        <Stat
          value={formatNumber(data.screened)}
          label="passaram no filtro"
          sub={`negociam ${money(data.min_liquidity)}+ por dia${fii ? " e pagam rendimento" : " e dão lucro"}`}
        />
        <Stat value={formatNumber(s.barato_subindo ?? 0)} label="baratos e ganhando força" accent />
        <Stat value={formatNumber(s.barato_caindo ?? 0)} label="baratos, mas ainda caindo" sub="cuidado: pode cair mais" />
      </div>
    </Card>
  );
}

export default async function ShortTermPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; visao?: string; busca?: string; pagina?: string }>;
}) {
  const { classe, visao, busca = "", pagina } = await searchParams;
  const assetClass: AssetClass = classe === "fiis" ? "fiis" : "acoes";
  const view = (VIEWS.find((v) => v.key === visao)?.key ?? (busca ? "todos" : "oportunidades")) as ShortTermView;
  const page = Math.max(1, Number(pagina) || 1);
  const data = await getShortTerm(assetClass, view, busca, (page - 1) * PAGE);
  const fii = assetClass === "fiis";
  const href = (c: AssetClass, v: ShortTermView, p = 1) =>
    `/curto-prazo?${new URLSearchParams({ classe: c, visao: v, ...(busca ? { busca } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`;
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <>
      <Breadcrumbs items={[{ label: "Mercado", href: "/mercado" }, { label: "Curto prazo" }]} />
      <PageTitle
        title="Curto prazo: o que está barato e ganhando força"
        subtitle={`Olhamos ${fii ? "todos os fundos imobiliários" : "todas as ações"} da bolsa pelo preço comparado ao patrimônio (P/VP), ${
          fii ? "pelos dividendos e imóveis vazios" : "pelo lucro, dividendos e saúde da empresa"
        }, e por como o preço vem andando nas últimas semanas.`}
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-negative/30 bg-negative/5 px-4 py-3 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-negative" />
        <div>
          <p className="font-semibold text-negative">Curto prazo é a forma mais arriscada de investir.</p>
          <p className="mt-1 text-muted">
            Um preço barato pode ficar mais barato, e nenhuma conta prevê quem vai subir: no teste com 10 anos de dados
            do app, nenhum indicador acertou sozinho. Use só dinheiro que você aceita perder, decida antes até quanto
            aceita cair e veja esta lista como ponto de partida para estudar, não como indicação de compra.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { label: "Ações", href: href("acoes", view), active: !fii },
            { label: "Fundos imobiliários", href: href("fiis", view), active: fii },
          ]}
        />
        <form action="/curto-prazo" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          <input type="hidden" name="classe" value={assetClass} />
          <input type="hidden" name="visao" value="todos" />
          <Search size={16} className="text-muted" />
          <input
            name="busca"
            defaultValue={busca}
            placeholder="Buscar papel"
            className="w-32 bg-transparent outline-none placeholder:text-muted"
          />
        </form>
      </div>
      <div className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmented options={VIEWS.map((v) => ({ label: v.label, href: href(assetClass, v.key), active: v.key === view }))} />
      </div>

      {!data ? (
        <EmptyState>
          Os números de todas as {fii ? "cotas" : "ações"} ainda estão sendo baixados. Eles vêm de fontes gratuitas e
          podem levar alguns minutos depois que o servidor acorda. Tente de novo em instantes.
        </EmptyState>
      ) : (
        <>
          <Summary data={data} fii={fii} />
          <AiInsight
            context={`curtoprazo:${assetClass}`}
            title="O que a varredura mostra"
            askPrompt={`Explique de forma simples a lista de curto prazo de ${fii ? "fundos imobiliários" : "ações"} e os riscos`}
          />

          <div className="mb-3 flex items-center justify-between text-sm text-muted">
            <span>
              {busca ? `Busca por "${busca}": ` : ""}
              {formatNumber(data.total)} {data.total === 1 ? "papel" : "papéis"}
            </span>
            <span>Atualizado {formatUpdated(data.updated_at)}</span>
          </div>

          {data.assets.length ? (
            <div className="flex flex-col gap-3">
              {data.assets.map((a, i) => (
                <AssetCard key={a.ticker} a={a} fii={fii} position={(page - 1) * PAGE + i + 1} />
              ))}
            </div>
          ) : (
            <EmptyState>
              {view === "oportunidades"
                ? "Agora nenhum papel junta desconto com preço subindo. Veja a lista de menor P/VP para os mais descontados, mesmo os que ainda caem."
                : "Nenhum papel encontrado."}
            </EmptyState>
          )}

          {pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              {page > 1 && (
                <Link href={href(assetClass, view, page - 1)} className="rounded-lg border border-border bg-surface px-4 py-2 font-semibold">
                  Anterior
                </Link>
              )}
              <span className="text-muted">
                Página {page} de {pages}
              </span>
              {page < pages && (
                <Link href={href(assetClass, view, page + 1)} className="rounded-lg border border-border bg-surface px-4 py-2 font-semibold">
                  Próxima
                </Link>
              )}
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-lg">Como ler a nota</h2>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>
                  A nota vai de 0 a 100 e compara cada papel com os outros da lista. Ela junta três partes:
                </p>
                <p>
                  <strong className="text-text">Desconto</strong>: {fii ? "P/VP baixo e dividendos altos" : "P/VP e P/L baixos e dividendos altos"}.{" "}
                  <strong className="text-text">{fii ? "Qualidade" : "Saúde"}</strong>:{" "}
                  {fii ? "poucos imóveis vazios e muita negociação" : "lucro alto sobre o patrimônio, boa margem e pouca dívida"}.{" "}
                  <strong className="text-text"><Term k="embalo">Embalo</Term></strong>: subiu no último mês, está acima da média
                  de 20 pregões e com mais gente negociando.
                </p>
                <p>
                  &quot;Barato e ganhando força&quot; junta desconto com preço virando para cima. &quot;Barato, mas ainda
                  caindo&quot; pode ser oportunidade ou armadilha: muitas vezes o mercado já sabe de um problema.
                </p>
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 text-lg">De onde vêm os números</h2>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>
                  Indicadores dos balanços entregues à CVM, pelo site Fundamentus
                  {data.fundamentals_at ? `, atualizados ${formatUpdated(data.fundamentals_at)}` : ""}. O embalo usa os
                  preços do Yahoo Finance dos {formatNumber(data.with_momentum)} papéis mais descontados. Quem não tem esse
                  histórico aparece com &quot;sem dado&quot;.
                </p>
                <p>
                  São fontes gratuitas, sem garantia e só para testes. Balanço é sempre do passado: um resultado ruim que
                  ainda não saiu não aparece aqui.
                </p>
              </div>
            </Card>
          </div>

          <p className="mt-6 text-xs text-muted">{data.disclaimer}</p>
        </>
      )}
    </>
  );
}
