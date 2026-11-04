import Link from "next/link";
import { AiInsight } from "@/app/components/AiInsight";
import { ScreenAssetCard } from "@/app/components/ScreenAssetCard";
import { Term } from "@/app/components/Term";
import { Breadcrumbs, Card, EmptyState, InfoBanner, PageTitle, Segmented, Stat } from "@/app/components/ui";
import { getShortTerm, type AssetClass, type ShortTermView } from "@/lib/api";
import { formatNumber, formatUpdated } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 30;

const VIEWS: { key: ShortTermView; label: string }[] = [
  { key: "baratas", label: "Baratas e sem alerta grave" },
  { key: "pvp", label: "Menor P/VP (todas)" },
  { key: "dividendos", label: "Mais dividendos" },
];

export default async function CheapPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; visao?: string; pagina?: string }>;
}) {
  const { classe, visao, pagina } = await searchParams;
  const assetClass: AssetClass = classe === "fiis" ? "fiis" : "acoes";
  const view = VIEWS.find((v) => v.key === visao)?.key ?? "baratas";
  const page = Math.max(1, Number(pagina) || 1);
  const data = await getShortTerm(assetClass, view, "", (page - 1) * PAGE, PAGE);
  const fii = assetClass === "fiis";
  const label = fii ? "fundos imobiliários" : "empresas";
  const href = (c: AssetClass, v: ShortTermView, p = 1) =>
    `/baratas?${new URLSearchParams({ classe: c, visao: v, ...(p > 1 ? { pagina: String(p) } : {}) })}`;
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <>
      <Breadcrumbs items={[{ label: "Mercado", href: "/mercado" }, { label: "Baratas" }]} />
      <PageTitle
        title={`${fii ? "Fundos imobiliários" : "Empresas"} baratas agora`}
        subtitle={
          fii
            ? "Fundos negociados abaixo do valor dos imóveis (P/VP baixo) e pagando bons rendimentos, com poucos imóveis vazios."
            : "Empresas negociadas a um preço baixo perto do patrimônio (P/VP) e do lucro (P/L), que pagam dividendos e estão com as contas saudáveis."
        }
      />
      <InfoBanner>
        Barato não quer dizer que vai subir: às vezes o preço está baixo porque o mercado já sabe de um problema. Por isso
        esta lista tira quem tem sinal de alerta grave (lucro ou dividendo que parece pontual, dívida alta, vendas
        caindo{fii ? ", muitos imóveis vazios ou um imóvel só" : ""}). É um ponto de partida para estudar, não uma
        recomendação de compra.
      </InfoBanner>

      <div className="mb-4">
        <Segmented
          options={[
            { label: "Ações", href: href("acoes", view), active: !fii },
            { label: "Fundos imobiliários", href: href("fiis", view), active: fii },
          ]}
        />
      </div>
      <div className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmented options={VIEWS.map((v) => ({ label: v.label, href: href(assetClass, v.key), active: v.key === view }))} />
      </div>

      {!data ? (
        <EmptyState>
          Os números de todas as {fii ? "cotas" : "ações"} ainda estão sendo baixados. Tente de novo em alguns minutos.
        </EmptyState>
      ) : (
        <>
          <Card className="mb-6">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
              <Stat value={formatNumber(data.total_listed)} label={`${label} olhadas`} />
              <Stat value={formatNumber(data.screened)} label="com negociação e números suficientes" />
              <Stat value={formatNumber(data.cheap_count ?? 0)} label="baratas e sem alerta grave" accent />
            </div>
          </Card>

          <AiInsight
            context={`baratas:${assetClass}`}
            title="O que essas baratas têm em comum"
            askPrompt={`Explique de forma simples por que essas ${label} parecem baratas e quais os riscos`}
          />

          <div className="mb-3 flex items-center justify-between text-sm text-muted">
            <span>
              {formatNumber(data.total)} {data.total === 1 ? "papel" : "papéis"}
            </span>
            <span>Atualizado {formatUpdated(data.fundamentals_at ?? data.updated_at)}</span>
          </div>

          {data.assets.length ? (
            <div className="flex flex-col gap-3">
              {data.assets.map((a, i) => (
                <ScreenAssetCard key={a.ticker} a={a} fii={fii} position={(page - 1) * PAGE + i + 1} showSignal={false} />
              ))}
            </div>
          ) : (
            <EmptyState>Agora nenhum papel passou em todos os filtros. Veja a lista de menor P/VP.</EmptyState>
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
              <h2 className="mb-3 text-lg">Como sabemos que está barata</h2>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>
                  <strong className="text-text"><Term k="pvp">P/VP</Term></strong>: o preço dividido pelo patrimônio. Abaixo
                  de 1, você paga menos do que {fii ? "valem os imóveis e títulos do fundo" : "a empresa tem de patrimônio"}.
                </p>
                {!fii && (
                  <p>
                    <strong className="text-text"><Term k="pl">P/L</Term></strong>: quantos anos de lucro pagariam o preço da
                    ação. Quanto menor, mais barata.
                  </p>
                )}
                <p>
                  <strong className="text-text"><Term k="dividend_yield">Dividendos</Term></strong>: quanto pagou nos últimos
                  12 meses, em % do preço.
                </p>
                <p>
                  A nota de 0 a 100 junta o desconto (65%) com a {fii ? "qualidade, poucos imóveis vazios e muita negociação" : "saúde da empresa, lucro sobre o patrimônio, margem e pouca dívida"} (35%),
                  comparando cada papel com os outros. Ela não olha se o preço vem subindo ou caindo.
                </p>
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 text-lg">De onde vêm os números</h2>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>
                  Dos balanços entregues à CVM, pelo site Fundamentus. Só entram papéis negociados todo dia (pelo menos
                  {fii ? " R$ 500 mil" : " R$ 2 milhões"} por dia){fii ? " e que pagam rendimento" : " e empresas que deram lucro"}.
                </p>
                <p>
                  Balanço é sempre do passado. Fonte gratuita, sem garantia e só para testes. Para ver o lado do preço, use a
                  aba <Link href="/curto-prazo" className="font-semibold text-accent-text">Curto prazo</Link>.
                </p>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
