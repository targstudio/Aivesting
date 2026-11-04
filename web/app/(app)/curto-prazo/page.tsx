import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";
import { AiInsight } from "@/app/components/AiInsight";
import { money, ScreenAssetCard } from "@/app/components/ScreenAssetCard";
import { Term } from "@/app/components/Term";
import { Breadcrumbs, Card, EmptyState, PageTitle, Segmented, Stat } from "@/app/components/ui";
import { getShortTerm, type AssetClass, type ShortTermList, type ShortTermView } from "@/lib/api";
import { formatNumber, formatUpdated } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIEWS: { key: ShortTermView; label: string }[] = [
  { key: "oportunidades", label: "Barato e ganhando força" },
  { key: "pvp", label: "Menor P/VP" },
  { key: "dividendos", label: "Mais dividendos" },
  { key: "todos", label: "Todos" },
];

const PAGE = 30;

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
                <ScreenAssetCard key={a.ticker} a={a} fii={fii} position={(page - 1) * PAGE + i + 1} />
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
