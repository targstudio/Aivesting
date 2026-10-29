import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import { getMacro, getMarket, getRanking, type MarketItem, type RankingSnapshot } from "@/lib/api";
import { changeColor, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { AiInsight } from "@/app/components/AiInsight";
import { AreaChart, Donut } from "@/app/components/charts";
import { RankingList } from "@/app/components/RankingList";
import { Card, CardHeader, EmptyState, InfoBanner, MiniStat, PageTitle } from "@/app/components/ui";

function TopRanking({ title, snapshot, href }: { title: string; snapshot: RankingSnapshot | null; href: string }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-sm font-medium text-muted hover:text-text">
          Ver todos
        </Link>
      </div>
      {snapshot && snapshot.assets.length ? (
        <RankingList assets={snapshot.assets.slice(0, 5)} benchmark={snapshot.benchmark} compact />
      ) : (
        <EmptyState>Ranking ainda não calculado. Verifique se a API está rodando.</EmptyState>
      )}
    </div>
  );
}

function IndexChart({ item, color, name, height = 200 }: { item: MarketItem | undefined; color: string; name: string; height?: number }) {
  if (!item) return <EmptyState>{name}: a fonte de índices não respondeu agora.</EmptyState>;
  const money = item.unit === "R$";
  return (
    <Card className="h-full">
      <CardHeader
        title={item.label}
        subtitle="Últimos 30 pregões"
        value={
          <>
            {money ? "R$ " : ""}
            {formatNumber(money ? item.value : Math.round(item.value))}
            <div className={`text-xs font-semibold ${changeColor(item.change_percent)}`}>{formatPercent(item.change_percent)} hoje</div>
          </>
        }
      />
      <AreaChart values={item.spark} color={color} prefix={money ? "R$ " : ""} decimals={money ? 2 : 0} height={height} />
    </Card>
  );
}

// O ranking muda durante o pregão: renderiza a cada acesso em vez de gerar a página no build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [acoes, fiis, macro, market] = await Promise.all([getRanking("acoes"), getRanking("fiis"), getMacro(), getMarket()]);
  const computedAt = acoes?.computed_at ?? fiis?.computed_at;
  const realtime = acoes?.data_realtime ?? false;
  const ibov = market?.indices.find((i) => i.symbol === "^BVSP");
  const usd = market?.indices.find((i) => i.symbol === "BRL=X");
  const sp = market?.indices.find((i) => i.symbol === "^GSPC");
  const breadth = market?.amplitude;
  const total = breadth ? breadth.altas + breadth.baixas + breadth.estaveis : 0;
  const ind = (key: string) => macro?.indicators.find((m) => m.key === key);
  const pct = (key: string) => (ind(key) ? `${formatNumber(ind(key)!.value)}%` : "–");

  return (
    <>
      <PageTitle eyebrow="Boas-vindas ao StockTower" title="Seu painel" />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <IndexChart item={ibov} color="var(--chart-2)" name="Ibovespa" height={260} />
        </div>
        <Card>
          <CardHeader title="Termômetro do app" subtitle={computedAt ? `Ranking recalculado às ${formatTime(computedAt)}` : "Ativos que sobem e caem hoje"} />
          <div className="flex justify-center">
            <Donut
              size={180}
              thickness={32}
              slices={[
                { label: "Sobem", value: breadth?.altas ?? 0, color: "rgb(var(--chart-3))" },
                { label: "Caem", value: breadth?.baixas ?? 0, color: "rgb(var(--chart-1))" },
                { label: "Estáveis", value: breadth?.estaveis ?? 0, color: "rgb(var(--chart-2))" },
              ]}
              center={
                <>
                  <span className="tabular text-2xl font-bold">{total ? Math.round(((breadth?.altas ?? 0) / total) * 100) : 0}%</span>
                  <span className="text-xs text-muted">em alta</span>
                </>
              }
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <MiniStat label="Sobem" value={breadth?.altas ?? "–"} color="rgb(var(--chart-3))" />
            <MiniStat label="Caem" value={breadth?.baixas ?? "–"} color="rgb(var(--chart-1))" />
            <MiniStat label="Selic" value={pct("selic")} color="rgb(var(--chart-2))" />
            <MiniStat label="IPCA 12 meses" value={pct("ipca_12m")} color="rgb(var(--chart-5))" />
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <IndexChart item={usd} color="var(--chart-1)" name="Dólar" />
        <IndexChart item={sp} color="var(--chart-3)" name="S&P 500" />
        <Link
          href="/assessor"
          className="group flex flex-col justify-between gap-6 rounded-card border border-border bg-gradient-to-br from-accent-bg to-surface p-5 md:p-6"
        >
          <span>
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-bg text-accent-text ring-1 ring-accent-text/30">
              <BriefcaseBusiness size={18} />
            </span>
            <span className="block text-lg font-semibold">Onde colocar o seu dinheiro?</span>
            <span className="mt-1 block text-sm text-muted">
              Diga quanto quer investir e por quantos meses: o Assessor IA monta o plano e sugere ações e FIIs para o seu prazo.
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent-text">
            Montar meu plano <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </div>

      <AiInsight context="inicio" title="Resumo do dia pela IA" askPrompt="Como está o mercado hoje no Brasil e lá fora?" />

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <TopRanking title="Ações com maior chance de superar o índice" snapshot={acoes} href="/ranking" />
        <TopRanking title="Fundos imobiliários" snapshot={fiis} href="/ranking?classe=fiis" />
      </div>

      <InfoBanner>
        Conteúdo informativo gerado por modelo estatístico em calibração. Não é recomendação de investimento.
        {!realtime && " Cotações com atraso até a contratação do feed em tempo real."}
      </InfoBanner>
    </>
  );
}
